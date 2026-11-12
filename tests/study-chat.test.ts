import type { Answer } from "#server/types.ts";
interface ChatFixture {
  directory: string;
  base: string;
  path: string;
  post: (data: unknown, extra?: RequestInit) => Promise<Response>;
}

import type { AddressInfo } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "#scripts/serve.ts";

async function fixture(
  answer: Answer,
  run: (context: ChatFixture) => Promise<void>,
) {
  const directory = mkdtempSync(join(tmpdir(), "study-chat-"));
  const server = createServer({ studyChatOptions: { directory, answer } });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    path = "/api/study-chat?key=question:test";
  const post = (data: unknown, extra: RequestInit = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify(data),
      ...extra,
    });
  try {
    await run({ directory, base, path, post });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(directory, { recursive: true, force: true });
  }
}
test("real HTTP boundary: stream, persisted continuation, rejected origin/input and corruption preserve history", async () => {
  let calls = 0;
  await fixture(
    async ({ messages, context, onDelta }) => {
      calls++;
      assert.equal(context, "Promise");
      assert.equal(messages.at(-1)!.text, calls === 1 ? "Первый" : "Уточнение");
      if (calls === 2) assert(messages.some((m) => m.text === "Объяснение"));
      onDelta("Объяс");
      onDelta("нение");
      return "Объяснение";
    },
    async ({ directory, base, path, post }) => {
      let response = await post({ context: "Promise", message: "Первый" });
      assert.equal(response.status, 200);
      assert((await response.text()).includes('"done":true'));
      const read = async () => await (await fetch(base + path)).json();
      assert.equal((await read()).messages[1].text, "Объяснение");
      response = await post({ context: "Promise", message: "Уточнение" });
      await response.text();
      assert.equal((await read()).messages.length, 4);
      const before = readFileSync(
        join(directory, readdirSync(directory)[0]),
        "utf8",
      );
      assert.equal(
        (
          await post(
            { message: "bad", context: "x" },
            {
              headers: {
                Origin: "https://evil.invalid",
                "Content-Type": "application/json",
              },
            },
          )
        ).status,
        403,
      );
      assert.equal((await post({ message: "", context: "x" })).status, 400);
      assert.equal(
        (
          await post(
            { message: "x", context: "x" },
            { headers: { "Content-Type": "application/json" } },
          )
        ).status,
        403,
      );
      assert.equal(
        readFileSync(join(directory, readdirSync(directory)[0]), "utf8"),
        before,
      );
      assert.equal(calls, 2);
      writeFileSync(join(directory, readdirSync(directory)[0]), "{broken");
      assert.equal((await fetch(base + path)).status, 500);
      assert.equal((await post({ message: "x", context: "x" })).status, 500);
      assert.equal(
        readFileSync(join(directory, readdirSync(directory)[0]), "utf8"),
        "{broken",
      );
    },
  );
});
test("cancel and concurrent request: partial history survives, no automatic retry", async () => {
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));
  let calls = 0;
  await fixture(
    async ({ onDelta, signal }) => {
      calls++;
      onDelta("Часть ответа");
      started();
      await new Promise<void>((r) =>
        signal.addEventListener("abort", () => r(), { once: true }),
      );
      throw Error("stopped");
    },
    async ({ base, path, post }) => {
      const first = post({ context: "Promise", message: "Первый" });
      await Promise.race([
        ready,
        first.then(() => {
          throw Error("Запрос завершился до начала генерации");
        }),
      ]);
      assert.equal(
        (await post({ context: "Promise", message: "Второй" })).status,
        409,
      );
      await fetch(base + "/api/study-chat/cancel?key=question:test", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: "{}",
      });
      assert((await (await first).text()).includes("Запрос остановлен"));
      const data = await (await fetch(base + path)).json();
      assert.equal(data.busy, false);
      assert.equal(data.messages[1].text, "Часть ответа");
      assert.equal(data.messages[1].status, "interrupted");
      assert.equal(calls, 1);
    },
  );
});
test("startup recovers pending answer as interrupted without sending it again", async () => {
  await fixture(
    async () => {
      throw Error("unreachable");
    },
    async ({ base, path, post, directory }) => {
      await (await post({ context: "x", message: "x" })).text();
      const file = join(directory, readdirSync(directory)[0]);
      const data = JSON.parse(readFileSync(file, "utf8"));
      data.messages[1].status = "pending";
      data.messages[1].text = "Partial";
      writeFileSync(file, JSON.stringify(data));
      const restored = await (await fetch(base + path)).json();
      assert.equal(restored.messages[1].status, "interrupted");
      assert.equal(restored.messages[1].text, "Partial");
    },
  );
});

test("explicit discussion mode preserves the existing hint history and preview contract", async () => {
  let calls = 0;
  await fixture(
    async ({ trustedTask, messages }) => {
      calls++;
      if (calls === 1)
        assert.match(trustedTask!, /Дай одну наводящую подсказку/);
      else {
        assert.match(trustedTask!, /Сначала ответь на текущий вопрос/);
        assert.doesNotMatch(trustedTask!, /Дай одну наводящую подсказку/);
        assert.ok(messages.some((message) => message.text === "Первый ответ"));
      }
      return calls === 1 ? "Первый ответ" : "Прямое объяснение";
    },
    async ({ base }) => {
      const key = "interview-hint:" + JSON.stringify(["session", "question"]);
      const post = (suffix: string, input: object) =>
        fetch(
          base + "/api/study-chat" + suffix + "?key=" + encodeURIComponent(key),
          {
            method: "POST",
            headers: { Origin: base, "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
      assert.equal(
        (
          await post("", {
            context: "scoped slots",
            message: "Помоги",
            discussionMode: "invalid",
          })
        ).status,
        400,
      );
      await (
        await post("", { context: "scoped slots", message: "Помоги" })
      ).text();
      const input = {
        context: "scoped slots",
        message: "Объясни",
        discussionMode: "discussion",
      };
      const preview = await (await post("/preview", input)).json();
      assert.match(preview.prompt, /Сначала ответь на текущий вопрос/);
      assert.equal(
        (await post("", { ...input, expectedPrompt: "old" })).status,
        409,
      );
      const response = await post("", {
        ...input,
        expectedPrompt: preview.prompt,
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /"done":true/);
      const history = await (
        await fetch(base + "/api/study-chat?key=" + encodeURIComponent(key))
      ).json();
      assert.equal(history.messages.length, 4);
      assert.equal(history.messages.at(-1).text, "Прямое объяснение");
      assert.equal(calls, 2);
    },
  );
});
