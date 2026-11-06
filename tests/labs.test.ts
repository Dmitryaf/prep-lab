import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import yauzl from "yauzl";
import { resolveKnowledgeLink } from "#domain/knowledge/links.ts";
import { renderMarkdown } from "#domain/knowledge/rendering.ts";

function entries(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const files = new Map<string, Buffer>();
      zip.on("error", reject);
      zip.on("end", () => resolve(files));
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return reject(error);
          const chunks: Buffer[] = [];
          stream.on("error", reject);
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

test("downloaded request lab contains its runnable package, source and regression tests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "frontend-lab-packaging-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/package-labs.ts", directory],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const files = await entries(
      await readFile(join(directory, "request-lifecycle.zip")),
    );
    const pkg = JSON.parse(
      files.get("request-lifecycle/package.json")!.toString(),
    );
    assert.equal(pkg.scripts.test, "vitest run");
    assert.ok(files.has("request-lifecycle/package-lock.json"));
    assert.ok(files.has("request-lifecycle/README.md"));
    assert.ok(files.has("request-lifecycle/useLatestSearch.ts"));
    assert.ok(files.has("request-lifecycle/useLatestSearch.test.ts"));
    assert.ok(
      [...files.keys()].every(
        (path) => !/node_modules|\.local|credentials|\.env|\.\.\//.test(path),
      ),
    );
    const reactFiles = await entries(
      await readFile(join(directory, "react-behavior.zip")),
    );
    const reactPackage = JSON.parse(
      reactFiles.get("react-behavior/package.json")!.toString(),
    );
    assert.equal(reactPackage.scripts.typecheck, "tsc --noEmit");
    assert.ok(reactFiles.has("react-behavior/src/examples/search.tsx"));
    assert.ok(reactFiles.has("react-behavior/tests/behavior.test.tsx"));
    assert.ok(reactFiles.has("react-behavior/README.md"));
    const performancePage = await readFile(
      join(directory, "performance-lab.html"),
      "utf8",
    );
    assert.ok(performancePage.length > 1000);
    // HTML parsing normalizes newlines before CSP hashes are checked.
    assert.equal(performancePage.includes("\r"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("only explicit public lab resources resolve outside the note inventory", () => {
  const resolve = (path: string) =>
    resolveKnowledgeLink(
      path,
      "note",
      () => undefined,
      () => "/note",
    );
  assert.equal(
    resolve("/labs/request-lifecycle.zip"),
    "/labs/request-lifecycle.zip",
  );
  assert.equal(resolve("/labs/react-behavior.zip"), "/labs/react-behavior.zip");
  assert.equal(
    resolve("/labs/performance-lab.html"),
    "/labs/performance-lab.html",
  );
  assert.match(
    renderMarkdown("[Скачать](/labs/request-lifecycle.zip)", {
      resolveLink: resolve,
    }),
    /href="\/labs\/request-lifecycle.zip"/,
  );
  for (const path of [
    "/labs/unknown.zip",
    "/labs/../.local/data",
    "/labs/%2e%2e/.local/data",
    "/labs/request-lifecycle.zip?file=.env",
    "//example.com/labs/request-lifecycle.zip",
  ]) {
    assert.equal(resolve(path), null, path);
  }
});
