import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import { DiscussionRepository } from "#server/infrastructure/storage/discussions.ts";
import { loadState } from "#domain/interview/saved-state.ts";
import { SourceRepository } from "#server/infrastructure/storage/sources.ts";
import { GenerationRepository } from "#server/infrastructure/storage/generations.ts";

test("standalone prompt assets, saved overrides and interrupted draft history survive restart without inference", async () => {
  const directory = await mkdtemp(join(tmpdir(), "frontend-lab-prompts-api-"));
  const database = openDatabase(
    join(directory, "data/instance/instance.sqlite"),
  );
  const id = "85cf76a0-306a-4d74-9bf4-e551d215c52c";
  new GenerationRepository(database).save({
    id,
    scenario: "project",
    status: "pending",
    createdAt: new Date().toISOString(),
    revision: 0,
    input: {
      profile: "react",
      request: "Разбор проекта",
      context: "",
      materials: [],
    },
    prompt: "Подготовленное задание",
    raw: "Сохранённая часть",
    draft: null,
    error: "",
  });
  database.close();
  let server = await startNitro(directory, true);
  const post = (path: string, body: unknown) =>
    fetch(server.base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: server.base },
      body: JSON.stringify(body),
    });
  try {
    const response = await fetch(server.base + "/api/prompts");
    assert.equal(response.status, 200, await response.clone().text());
    const { prompts: states } = await response.json();
    assert.equal(states.length, 3);
    const template = states.find(
      (state: { template: { id: string } }) =>
        state.template.id === "discussion",
    );
    assert(template);
    assert.equal(
      (
        await post("/api/prompts/discussion/save", {
          revision: 0,
          baseVersion: template.template.version,
          text: "Мой вариант объяснения.",
        })
      ).status,
      200,
    );
    const previewResponse = await post(
      "/api/study-chat/preview?key=note-test",
      { message: "Объясни механизм", context: "# Выбранный материал" },
    );
    assert.equal(
      previewResponse.status,
      200,
      await previewResponse.clone().text(),
    );
    assert.match(
      (await previewResponse.json()).prompt,
      /Мой вариант объяснения/,
    );
    const interrupted = await (
      await fetch(server.base + "/api/generations/" + id)
    ).json();
    assert.equal(interrupted.status, "interrupted");
    assert.equal(interrupted.raw, "Сохранённая часть");
    await server.stop();
    server = await startNitro(directory, true);
    const { prompts: retained } = await (
      await fetch(server.base + "/api/prompts")
    ).json();
    assert.equal(
      retained.find(
        (state: { template: { id: string } }) =>
          state.template.id === "discussion",
      ).text,
      "Мой вариант объяснения.",
    );
    assert.equal(
      (await (await fetch(server.base + "/api/generations/" + id)).json())
        .status,
      "interrupted",
    );
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("standalone source API persists previews and accepted knowledge across restarts and denies arbitrary roots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "frontend-lab-source-api-"));
  const root = join(directory, "vault");
  await mkdir(root);
  const path = join(root, "Свой материал.md");
  const bytes =
    "# JavaScript\n## Свой вопрос\n> [!answer]- Ответ\n> Ответ из источника.\n";
  await writeFile(path, bytes);
  const database = openDatabase(
    join(directory, "data/instance/instance.sqlite"),
  );
  new SourceRepository(database).allowRoot("vault", "Разрешённая база", root);
  database.close();
  let server = await startNitro(directory, true);
  const post = (operation: string, body: unknown, origin = server.base) =>
    fetch(server.base + "/api/sources/" + operation, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await post("preview", {}, "https://other.example")).status,
      403,
    );
    assert.equal(
      (
        await post("preview", {
          name: "Не разрешена",
          kind: "folder",
          rootId: root,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("preview", {
          name: "Не разрешена",
          kind: "folder",
          rootId: "vault",
          path: root,
        })
      ).status,
      400,
    );
    const catalog = await (await fetch(server.base + "/api/sources")).json();
    assert.deepEqual(catalog.roots, [
      { id: "vault", name: "Разрешённая база" },
    ]);
    assert(!JSON.stringify(catalog).includes(root));
    const response = await post("preview", {
      name: "База",
      kind: "folder",
      rootId: "vault",
    });
    assert.equal(response.status, 200, await response.clone().text());
    const { preview } = await response.json();
    assert.equal(
      (
        await (await fetch(server.base + "/api/knowledge")).json()
      ).questions.some(
        (question: { title: string }) => question.title === "Свой вопрос",
      ),
      false,
    );
    await server.stop();
    server = await startNitro(directory, true);
    const restored = await (
      await fetch(server.base + "/api/sources/preview/" + preview.id)
    ).json();
    assert.equal(restored.id, preview.id);
    assert.equal(
      (await post("accept", { id: preview.id, revision: 0, resolutions: {} }))
        .status,
      200,
    );
    const current = await (await fetch(server.base + "/api/knowledge")).json();
    const question = current.questions.find(
      (question: { title: string }) => question.title === "Свой вопрос",
    );
    assert(question);
    await server.stop();
    server = await startNitro(directory, true);
    const restarted = await (
      await fetch(server.base + "/api/knowledge")
    ).json();
    assert.equal(
      restarted.questions.find(
        (item: { id: string }) => item.id === question.id,
      ).answer,
      question.answer,
    );
    await rm(root, { recursive: true });
    assert.equal(
      (
        await post("preview", {
          sourceId: preview.source.id,
          name: "База",
          kind: "folder",
          rootId: "vault",
        })
      ).status,
      503,
    );
    assert.equal(
      (await (await fetch(server.base + "/api/sources")).json()).revision,
      1,
    );
    assert.equal(
      (
        await (await fetch(server.base + "/api/knowledge")).json()
      ).questions.find((item: { id: string }) => item.id === question.id)
        .answer,
      question.answer,
    );
    // Use the accepted snapshot as evidence of exact external bytes, without recreating the removed source.
    const accepted = await (await fetch(server.base + "/api/sources")).json();
    assert.equal(accepted.sources[0].documents[0].sourceMarkdown, bytes);
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function startNitro(directory: string, bundled = false) {
  const reserve = createServer();
  await new Promise<void>((done) => reserve.listen(0, "127.0.0.1", done));
  const address = reserve.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((done) => reserve.close(() => done()));
  const child = spawn(process.execPath, [resolve(".output/server/index.mjs")], {
    cwd: directory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      CAREER_KNOWLEDGE_ROOT: bundled ? undefined : directory,
      FRONTEND_LAB_DATA_DIR: join(directory, "data"),
      FRONTEND_LAB_LEGACY_CHAT_DIR: join(directory, "legacy-chats"),
    },
  });
  let log = "";
  child.stderr.on("data", (part) => {
    log += String(part);
  });
  const stop = async () => {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  };
  try {
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Nitro startup timeout: " + log)),
        15_000,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Nitro exited: ${code}; ${log}`));
      });
      child.stdout.on("data", (part) => {
        if (String(part).includes("Listening on")) {
          clearTimeout(timer);
          done();
        }
      });
    });
    return { base: `http://127.0.0.1:${port}`, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

test("standalone Nitro serves the shell, configured knowledge and icons without exposing private paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "frontend-lab-nitro-"));
  await mkdir(join(directory, "Собеседования/Темы"), { recursive: true });
  await writeFile(
    join(directory, "Собеседования/Темы/JavaScript.md"),
    "# JavaScript\n## Проверка Nitro\n> [!answer]- Ответ\n> Проверяемый ответ.\n",
  );
  const { base, stop } = await startNitro(directory);
  try {
    const health = await (await fetch(base + "/api/health")).json();
    assert.equal(health.autoClose, false);
    const knowledge = await (await fetch(base + "/api/knowledge")).json();
    assert.equal(knowledge.questions[0].title, "Проверка Nitro");
    assert((await (await fetch(base)).text()).includes('class="platform"'));
    const icon = await fetch(base + "/favicon.svg");
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get("content-type") || "", /image\/svg\+xml/);
    assert.equal((await fetch(base + "/api/lifecycle")).status, 204);
    assert.equal(
      (
        await fetch(base + "/api/knowledge", {
          headers: { Origin: "https://other.example" },
        })
      ).status,
      403,
    );
    for (const path of [
      "/AGENTS.md",
      "/server/knowledge.ts",
      "/.local/instance.sqlite",
      "/artifacts/private/credentials.json",
    ])
      assert.equal((await fetch(base + path)).status, 403, path);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("clean standalone bundles the full common base without a vault or owner package", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "frontend-lab-clean-content-"),
  );
  const server = await startNitro(directory, true);
  try {
    const response = await fetch(server.base + "/api/knowledge");
    assert.equal(response.status, 200);
    const bank = await response.json();
    assert.equal(bank.notes.length, 219);
    assert.equal(bank.questions.length, 582);
    assert.equal(bank.route.length, 62);
    assert.deepEqual(bank.warnings, []);
    assert(
      !/Dmitryaf|МЭДО|Inbox Point|Trajectory|Landocs|Docshouse|cokr/i.test(
        JSON.stringify(bank),
      ),
    );
    const projects = await (await fetch(server.base + "/api/projects")).json();
    assert.deepEqual(projects.topics, []);
    assert.deepEqual(projects.projects, {});
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("standalone restart retains accepted preparation and recovers partial discussions without a new model turn", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "frontend-lab-nitro-storage-"),
  );
  let server = await startNitro(directory);
  try {
    const original = {
      ...loadState({ getItem: () => null }),
      questionProgress: { retired: { status: "again" } },
    };
    const request = (path: string, method: string, body: unknown) =>
      fetch(server.base + path, {
        method,
        headers: { Origin: server.base, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const migrated = await request("/api/preparation/migrate", "POST", {
      state: original,
    });
    assert.equal(migrated.status, 200);
    const before = await migrated.json();
    before.state.questionProgress.retired.status = "done";
    const saved = await request("/api/preparation", "PUT", {
      state: before.state,
      expectedRevision: before.revision,
    });
    assert.equal(saved.status, 200);
    const accepted = await saved.json();
    const settingsResponse = await request("/api/settings/migrate", "POST", {
      sourceRoot: "C:\\Work\\source",
    });
    assert.equal(settingsResponse.status, 200);
    const settings = await settingsResponse.json();
    assert.equal(
      (
        await request("/api/preparation", "PUT", {
          state: original,
          expectedRevision: 0,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(server.base + "/api/preparation", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: original, expectedRevision: 2 }),
        })
      ).status,
      403,
    );
    await server.stop();
    const database = openDatabase(
      join(directory, "data/instance/instance.sqlite"),
    );
    try {
      new DiscussionRepository(database).save({
        key: "question:restart",
        messages: [
          {
            role: "assistant",
            text: "Сохранённый фрагмент",
            status: "pending",
          },
        ],
      });
    } finally {
      database.close();
    }
    server = await startNitro(directory);
    assert.deepEqual(
      await (await fetch(server.base + "/api/settings")).json(),
      settings,
    );
    assert.deepEqual(
      await (await fetch(server.base + "/api/preparation")).json(),
      accepted,
    );
    assert.deepEqual(
      await (
        await request("/api/preparation/migrate", "POST", { state: original })
      ).json(),
      accepted,
    );
    const history = await fetch(
      server.base + "/api/study-chat?key=question:restart",
    );
    assert.equal(history.status, 200);
    assert.deepEqual((await history.json()).messages, [
      {
        role: "assistant",
        text: "Сохранённый фрагмент",
        status: "interrupted",
      },
    ]);
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("standalone reports unavailable storage without replacing a corrupt file or exposing its path", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "frontend-lab-nitro-corrupt-"),
  );
  const path = join(directory, "data/instance/instance.sqlite");
  await mkdir(join(directory, "data/instance"), { recursive: true });
  await writeFile(path, "original damaged database");
  const server = await startNitro(directory);
  try {
    const response = await fetch(server.base + "/api/preparation");
    assert.equal(response.status, 503);
    const body = await response.text();
    assert(!body.includes(directory));
    assert.match(body, /Прежние файлы не заменены/);
    const { readFile } = await import("node:fs/promises");
    assert.equal(await readFile(path, "utf8"), "original damaged database");
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
