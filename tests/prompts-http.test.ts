import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import { PromptRepository } from "#server/infrastructure/storage/prompts.ts";
import { readPromptTemplates } from "#server/infrastructure/prompts/templates.ts";
import { handlePrompts } from "#server/infrastructure/http/prompts.ts";

test("prompt API previews unsaved text, persists overrides and rejects stale writes and arbitrary operations", async () => {
  const database = openDatabase(":memory:");
  const repository = new PromptRepository(database);
  const templates = readPromptTemplates();
  const server = createServer(async (request, response) => {
    if (
      !(await handlePrompts(request, response, repository, () => templates))
    ) {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, origin = base) =>
    fetch(base + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const list = await (await fetch(base + "/api/prompts")).json();
    assert.equal(list.prompts.length, 3);
    const state = list.prompts.find(
      (item: { template: { id: string } }) => item.template.id === "discussion",
    );
    assert.equal(state.customized, false);
    const preview = await post("/api/prompts/discussion/preview", {
      text: "Краткий личный промпт",
      input: {
        profile: "vue",
        request: "Объясни микрозадачи",
        context: "Для повторения",
        materials: [{ id: "note-1", path: "Loop.md", text: "# Микрозадачи" }],
      },
    });
    assert.equal(preview.status, 200);
    const composed = await preview.json();
    assert(composed.prompt.includes("Краткий личный промпт"));
    assert(composed.prompt.includes("# Микрозадачи"));
    assert.equal(
      repository.read(templates.find((item) => item.id === "discussion")!)
        .revision,
      0,
    );
    const input = {
      revision: 0,
      baseVersion: state.template.version,
      text: "Сохранённый личный промпт",
    };
    assert.equal(
      (
        await post(
          "/api/prompts/discussion/save",
          input,
          "https://other.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await post("/api/prompts/discussion/save", input)).status,
      200,
    );
    assert.equal(
      (await post("/api/prompts/discussion/save", input)).status,
      409,
    );
    const current = await (await fetch(base + "/api/prompts")).json();
    assert.equal(
      current.prompts.find(
        (item: { template: { id: string } }) =>
          item.template.id === "discussion",
      ).text,
      input.text,
    );
    assert.equal(
      (
        await post("/api/prompts/discussion/save", {
          ...input,
          revision: 1,
          command: "shell",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("/api/prompts/discussion/preview", {
          text: "x",
          input: {
            profile: "vue",
            request: "x",
            context: "",
            materials: [],
            rpc: "turn/start",
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (await post("/api/prompts/discussion/rpc", { method: "turn/start" }))
        .status,
      404,
    );
    assert.equal(
      (
        await post("/api/prompts/discussion/save", {
          revision: 1,
          baseVersion: state.template.version,
          text: null,
        })
      ).status,
      200,
    );
    assert.equal(
      repository.read(templates.find((item) => item.id === "discussion")!)
        .customized,
      false,
    );
    database
      .prepare("UPDATE instance_meta SET value=? WHERE key='prompt:discussion'")
      .run('{"text":17}');
    assert.equal((await fetch(base + "/api/prompts")).status, 503);
    assert.equal(
      database
        .prepare(
          "SELECT value FROM instance_meta WHERE key='prompt:discussion'",
        )
        .pluck()
        .get(),
      '{"text":17}',
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    database.close();
  }
});
