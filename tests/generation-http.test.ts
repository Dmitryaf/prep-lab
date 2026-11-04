import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "../scripts/serve.ts";
import type { Answer } from "../server/types.ts";
import { projectDraftFixture } from "./fixtures/project-draft.ts";
import type { PromptInput } from "../domain/prompts/contracts.ts";
import { openDatabase } from "../server/infrastructure/storage/database.ts";

const input: PromptInput = {
  profile: "react",
  request: "Разобрать форму регистрации.",
  context:
    "Работал над формой регистрации. Моя конкретная роль пока не уточнена.",
  materials: [],
};
type Running = {
  base: string;
  databasePath: string;
  post: (
    path: string,
    body: unknown,
    options?: { origin?: string; signal?: AbortSignal },
  ) => Promise<Response>;
  preview: (scenario: "import" | "project") => Promise<string>;
};
async function withServer(
  answer: Answer,
  run: (server: Running) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "lab-generation-api-"));
  const server = createServer({
    databasePath: join(directory, "instance.sqlite"),
    projectPackageRoot: null,
    credentialDirectory: join(directory, "credentials"),
    generationAnswer: answer,
    studyChatOptions: {
      directory: join(directory, "discussions"),
      answer: async () => {
        throw new Error("Обсуждение в этом тесте не используется.");
      },
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post: Running["post"] = (path, body, options = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Origin: options.origin || base,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  const preview: Running["preview"] = async (scenario) => {
    const response = await post(`/api/prompts/${scenario}/preview`, { input });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).prompt;
  };
  try {
    await run({
      base,
      databasePath: join(directory, "instance.sqlite"),
      post,
      preview,
    });
  } finally {
    await server.closeStudyChat();
    server.closeAllConnections();
    if (server.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}
async function completed(response: Response) {
  assert.equal(response.status, 200, await response.clone().text());
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(events.some((event) => event.done === true));
  assert(!events.some((event) => event.error));
  const id = events.find((event) => typeof event.id === "string")?.id;
  assert(id);
  return id as string;
}
async function job(base: string, id: string) {
  return (await fetch(base + "/api/generations/" + id)).json();
}
async function interrupted(base: string, id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = await job(base, id);
    if (current.status === "interrupted") return current;
    await delay(10);
  }
  assert.fail("Прерванный запрос не сохранён в срок.");
}

test("generation HTTP rejects changed exact prompt, extra RPC fields and foreign origin before invoking the fake Answer", async () => {
  let calls = 0;
  await withServer(
    async ({ onDelta }) => {
      calls++;
      const result = JSON.stringify(projectDraftFixture);
      onDelta(result);
      return result;
    },
    async ({ base, post, preview }) => {
      const expectedPrompt = await preview("project");
      assert.equal(
        (
          await post("/api/generations", {
            scenario: "project",
            input,
            expectedPrompt: "Изменённый промпт",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await post("/api/generations", {
            scenario: "project",
            input,
            expectedPrompt,
            rpc: "turn/start",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await post(
            "/api/generations",
            { scenario: "project", input, expectedPrompt },
            { origin: "https://other.example" },
          )
        ).status,
        403,
      );
      assert.equal(calls, 0);
      assert.deepEqual(
        (await (await fetch(base + "/api/generations")).json()).jobs,
        [],
      );
      const id = await completed(
        await post("/api/generations", {
          scenario: "project",
          input,
          expectedPrompt,
        }),
      );
      assert.equal(calls, 1);
      const current = await job(base, id);
      assert.equal(current.status, "completed");
      assert.equal(
        Object.keys(
          (await (await fetch(base + "/api/projects")).json()).projects,
        ).length,
        0,
      );
      const changed = { ...projectDraftFixture, name: "Принятый разбор" };
      const accepted = await post(`/api/generations/${id}/accept`, {
        revision: current.revision,
        draft: changed,
      });
      assert.equal(accepted.status, 200, await accepted.clone().text());
      const { projectId } = await accepted.json();
      assert(projectId);
      const catalog = await (await fetch(base + "/api/projects")).json();
      assert.equal(catalog.projects[projectId].name, "Принятый разбор");
      assert.equal((await job(base, id)).status, "accepted");
      const again = await post(`/api/generations/${id}/accept`, {
        revision: current.revision,
        draft: changed,
      });
      assert.deepEqual(await again.json(), { projectId });
      assert.equal(calls, 1);
    },
  );
});

test("accepting an import generation creates exactly one inactive source preview before separate acceptance", async () => {
  let calls = 0;
  const draft = {
    schemaVersion: 1,
    documents: [
      {
        path: "Generated.md",
        markdown:
          "# Учебная заметка\n## Новый вопрос\n> [!answer]- Ответ\n> Подготовленный ответ.\n",
        profile: "shared",
        kind: "theory",
      },
    ],
  };
  await withServer(
    async () => {
      calls++;
      return JSON.stringify(draft);
    },
    async ({ base, post, preview }) => {
      const id = await completed(
        await post("/api/generations", {
          scenario: "import",
          input,
          expectedPrompt: await preview("import"),
        }),
      );
      const before = await (await fetch(base + "/api/sources")).json();
      assert.equal(before.sources.length, 0);
      assert.equal(before.pending.length, 0);
      const accepted = await post(`/api/generations/${id}/accept`, {
        revision: 0,
        draft,
      });
      assert.equal(accepted.status, 200, await accepted.clone().text());
      const { previewId } = await accepted.json();
      assert.equal(typeof previewId, "string");
      const middle = await (await fetch(base + "/api/sources")).json();
      assert.equal(middle.sources.length, 0);
      assert.equal(middle.pending.length, 1);
      assert.equal(middle.pending[0].id, previewId);
      assert.equal(middle.revision, 0);
      assert.deepEqual(
        await (
          await post(`/api/generations/${id}/accept`, { revision: 0, draft })
        ).json(),
        { previewId },
      );
      assert.equal(
        (await (await fetch(base + "/api/sources")).json()).pending.length,
        1,
      );
      const applied = await post("/api/sources/accept", {
        id: previewId,
        revision: 0,
        resolutions: {},
      });
      assert.equal(applied.status, 200, await applied.clone().text());
      const after = await (await fetch(base + "/api/sources")).json();
      assert.equal(after.sources.length, 1);
      assert.equal(after.revision, 1);
      assert.equal(calls, 1);
    },
  );
});

test("explicit cancellation and client disconnect preserve partial output and never retry the fake Answer", async () => {
  let calls = 0;
  await withServer(
    async ({ signal, onDelta }) => {
      calls++;
      onDelta("Сохранённый частичный ответ.");
      if (!signal.aborted)
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      throw new Error("Тестовая отмена.");
    },
    async ({ base, post, preview }) => {
      const expectedPrompt = await preview("project");
      async function begin(signal?: AbortSignal) {
        const response = await post(
          "/api/generations",
          { scenario: "project", input, expectedPrompt },
          { signal },
        );
        assert.equal(response.status, 200);
        assert(response.body);
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let buffer = "",
          id = "",
          partial = false;
        while (!partial) {
          const next = await reader.read();
          assert.equal(next.done, false);
          buffer += decoder.decode(next.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const event = JSON.parse(line);
            if (event.id) id = event.id;
            if (event.delta?.includes("Сохранённый частичный ответ."))
              partial = true;
          }
        }
        assert(id);
        return { reader, id };
      }
      const first = await begin();
      // A second explicit request is rejected while this answer is active.
      assert.equal(
        (
          await post("/api/generations", {
            scenario: "project",
            input,
            expectedPrompt,
          })
        ).status,
        409,
      );
      assert.equal(calls, 1);
      assert.equal(
        (await post(`/api/generations/${first.id}/cancel`, {})).status,
        200,
      );
      await first.reader.cancel();
      first.reader.releaseLock();
      const cancelled = await interrupted(base, first.id);
      assert.equal(cancelled.raw, "Сохранённый частичный ответ.");
      assert.equal(cancelled.draft, null);
      const controller = new AbortController(),
        second = await begin(controller.signal);
      controller.abort();
      await second.reader.cancel().catch(() => {});
      second.reader.releaseLock();
      const disconnected = await interrupted(base, second.id);
      assert.equal(disconnected.raw, "Сохранённый частичный ответ.");
      assert.equal(disconnected.draft, null);
      await delay(30);
      const history = await (await fetch(base + "/api/generations")).json();
      assert.equal(history.jobs.length, 2);
      assert(
        history.jobs.every(
          (entry: { status: string }) => entry.status === "interrupted",
        ),
      );
      assert.equal(calls, 2);
      assert.equal(
        Object.keys(
          (await (await fetch(base + "/api/projects")).json()).projects,
        ).length,
        0,
      );
    },
  );
});

test("failed import acceptance rolls back the newly created preview and remains retryable without another Answer", async () => {
  let calls = 0;
  const draft = {
    schemaVersion: 1,
    documents: [
      {
        path: "Draft.md",
        markdown: "# Материал\n## Вопрос\n> [!answer]- Ответ\n> Ответ.\n",
        kind: "theory",
        profile: "shared",
      },
    ],
  };
  await withServer(
    async () => {
      calls++;
      return JSON.stringify(draft);
    },
    async ({ base, post, preview, databasePath }) => {
      const id = await completed(
        await post("/api/generations", {
          scenario: "import",
          input,
          expectedPrompt: await preview("import"),
        }),
      );
      const database = openDatabase(databasePath);
      try {
        database.exec(
          "CREATE TRIGGER fail_accept_import BEFORE UPDATE OF value ON instance_meta WHEN NEW.key LIKE 'generation:%' AND json_extract(NEW.value,'$.status')='accepted' BEGIN SELECT RAISE(ABORT,'simulated write failure'); END",
        );
        assert.equal(
          (await post(`/api/generations/${id}/accept`, { revision: 0, draft }))
            .status,
          503,
        );
        const unchanged = await (await fetch(base + "/api/sources")).json();
        assert.equal(unchanged.pending.length, 0);
        assert.equal(unchanged.sources.length, 0);
        assert.equal(unchanged.revision, 0);
        assert.equal((await job(base, id)).status, "completed");
        database.exec("DROP TRIGGER fail_accept_import");
        const accepted = await post(`/api/generations/${id}/accept`, {
          revision: 0,
          draft,
        });
        assert.equal(accepted.status, 200, await accepted.clone().text());
        assert.equal(typeof (await accepted.json()).previewId, "string");
        assert.equal(
          (await (await fetch(base + "/api/sources")).json()).pending.length,
          1,
        );
        assert.equal(calls, 1);
      } finally {
        database.close();
      }
    },
  );
});
