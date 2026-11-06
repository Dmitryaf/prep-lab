import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProjectCatalog } from "#server/infrastructure/projects/catalog.ts";
import { projectFixture } from "./fixtures/projects.ts";

test("a missing private package is optional; a corrupt or incomplete package is never treated as empty", () => {
  assert.deepEqual(readProjectCatalog(null).topics, []);
  const directory = mkdtempSync(join(tmpdir(), "frontend-lab-package-")),
    path = join(directory, "projects.json");
  try {
    assert.throws(() => readProjectCatalog(directory));
    writeFileSync(path, "damaged original");
    assert.throws(() => readProjectCatalog(directory));
    assert.equal(readFileSync(path, "utf8"), "damaged original");
    const valid = projectFixture();
    writeFileSync(path, JSON.stringify(valid));
    assert.deepEqual(readProjectCatalog(directory), valid);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
