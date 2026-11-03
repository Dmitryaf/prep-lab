import type { AddressInfo } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../scripts/serve.ts";
test("static server serves only the map, never old data, code repositories or mutations", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const index = await (await fetch(base + "/")).text();
    const assets = [...index.matchAll(/(?:src|href)="(\/_nuxt\/[^"]+)"/g)].map(
      (m) => m[1],
    );
    assert(assets.length >= 2);
    for (const path of ["/", ...assets]) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200, path);
      assert((await r.text()).length > 30);
    }
    for (const path of [
      "/src/main.ts",
      "/server/knowledge.mjs",
      "/server/knowledge.ts",
      "/app.js",
      "/lab/",
      "/lab/.data/lab.sqlite",
      "/api/state",
      "/source/lab/domain.mjs",
      "/source/cokr/src/app.ts",
      "/%2e%2e%5cAGENTS.md",
      "/C:/private/project/package.json",
    ]) {
      const r = await fetch(base + path);
      assert([403, 404].includes(r.status), path);
    }
    assert.equal(
      (await fetch(base + "/app.js", { method: "POST", body: "x" })).status,
      405,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
