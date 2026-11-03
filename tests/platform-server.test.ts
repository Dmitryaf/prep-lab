import type { AddressInfo } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../scripts/serve.ts";
import { get } from "node:http";
test("API reads only configured knowledge and degrades without hiding map", async () => {
  const root = mkdtempSync(join(tmpdir(), "map-api-"));
  mkdirSync(join(root, "Собеседования", "Темы"), { recursive: true });
  writeFileSync(
    join(root, "Собеседования", "Темы", "JavaScript.md"),
    "# JavaScript\n\n## Question?\n\n> [!answer]- Answer\n> Secret answer\n",
  );
  writeFileSync(join(root, "private.md"), "PRIVATE OUTSIDE ALLOWLIST");
  const server = createServer({ knowledgeRoot: root });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(base + "/api/knowledge");
    assert.equal(response.status, 200);
    const data = await response.json();
    assert(data.questions.length);
    assert(!JSON.stringify(data).includes("PRIVATE OUTSIDE"));
    assert.equal(
      (
        await fetch(base + "/api/knowledge", {
          headers: { Origin: "https://foreign.invalid" },
        })
      ).status,
      403,
    );
    const foreignHost = await new Promise((resolve, reject) =>
      get(
        base + "/api/knowledge",
        { headers: { Host: "foreign.invalid" } },
        (r) => {
          r.resume();
          resolve(r.statusCode);
        },
      ).on("error", reject),
    );
    assert.equal(foreignHost, 403);
    for (const path of [
      "/api/knowledge/private.md",
      "/source/cokr/file",
      "/%2e%2e%5cprivate.md",
    ])
      assert([403, 404].includes((await fetch(base + path)).status));
    assert.equal(
      (await fetch(base + "/api/knowledge", { method: "POST" })).status,
      405,
    );
    writeFileSync(
      join(root, "Собеседования", "Темы", "JavaScript.md"),
      "# JavaScript\n\n## New question?\n\n> [!answer]- Answer\n> Updated\n",
    );
    assert(
      (await (await fetch(base + "/api/knowledge")).text()).includes(
        "New question",
      ),
    );
    rmSync(root, { recursive: true });
    assert.equal((await fetch(base + "/api/knowledge")).status, 503);
    assert.equal((await fetch(base + "/")).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(root, { recursive: true, force: true });
  }
});
