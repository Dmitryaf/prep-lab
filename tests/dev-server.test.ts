import type { Knowledge } from "../domain/knowledge/material.ts";
import type { AddressInfo } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createDevelopmentServer } from "../scripts/dev.ts";
import { resolve } from "node:path";
import { readKnowledge } from "../server/application/knowledge.ts";
test("Vue development entry serves app and readonly API without exposing private workspace files", async () => {
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const dev = await createDevelopmentServer({ port, databasePath: ":memory:" }),
    base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(base + "/")).status, 200);
    assert((await (await fetch(base + "/")).text()).includes('id="__nuxt"'));
    const bank: Knowledge = await (await fetch(base + "/api/knowledge")).json();
    const expected = await readKnowledge();
    assert.deepEqual(
      bank.questions.map((q) => q.id),
      expected.questions.map((q) => q.id),
    );
    assert.deepEqual(bank.warnings, []);
    for (const path of [
      "/AGENTS.md",
      "/server/knowledge.mjs",
      "/server/knowledge.ts",
      "/docs/interview-content-review.md",
      "/artifacts/interview-study-20261028/report.html",
      "/@fs/" + resolve("AGENTS.md").replaceAll("\\", "/"),
    ])
      assert([403, 404].includes((await fetch(base + path)).status), path);
    assert.equal(
      (await fetch(base + "/api/knowledge", { method: "POST" })).status,
      405,
    );
  } finally {
    await dev.close();
  }
});
