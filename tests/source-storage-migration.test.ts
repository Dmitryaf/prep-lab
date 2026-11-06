import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { versionOneDatabase } from "./fixtures/sqlite-v1.ts";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import { PreparationRepository } from "#server/infrastructure/storage/preparation.ts";

test("source storage upgrades version one without changing existing repeats or their revision", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-lab-v1-upgrade-")),
    path = join(directory, "instance.sqlite");
  try {
    versionOneDatabase(path).close();
    const database = openDatabase(path);
    try {
      const state = new PreparationRepository(database).read();
      assert.equal(state.revision, 7);
      assert.equal(
        state.state.questionProgress["retired-question"].status,
        "again",
      );
      assert(Number(database.pragma("user_version", { simple: true })) >= 2);
      assert.deepEqual(database.prepare("SELECT id FROM sources").all(), []);
      assert.deepEqual(
        database.prepare("SELECT source_id FROM source_documents").all(),
        [],
      );
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("a failed source migration rolls back schema and metadata while preserving old records", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-lab-v1-interrupt-")),
    path = join(directory, "instance.sqlite");
  try {
    const original = versionOneDatabase(path);
    original.exec(
      "CREATE TRIGGER stop_source_migration BEFORE INSERT ON instance_meta WHEN NEW.key='content_revision' BEGIN SELECT RAISE(ABORT, 'test migration interruption'); END",
    );
    original.close();
    assert.throws(() => openDatabase(path), /test migration interruption/);
    const reopened = new Database(path);
    try {
      assert.equal(reopened.pragma("user_version", { simple: true }), 1);
      assert.equal(
        reopened
          .prepare(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='sources'",
          )
          .pluck()
          .get(),
        0,
      );
      assert.equal(
        reopened
          .prepare(
            "SELECT status FROM question_marks WHERE id='retired-question'",
          )
          .pluck()
          .get(),
        "again",
      );
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
