import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import { DiscussionRepository } from "#server/infrastructure/storage/discussions.ts";

test("legacy JSON history is imported once without changing its original file", () => {
  const dir = mkdtempSync(join(tmpdir(), "frontend-lab-history-")),
    key = "question:legacy";
  const file = join(
    dir,
    createHash("sha256").update(key).digest("hex") + ".json",
  );
  const original = JSON.stringify({
    key,
    messages: [
      { role: "user", text: "Прежний вопрос", status: "completed" },
      { role: "assistant", text: "Незавершённый ответ", status: "pending" },
    ],
  });
  writeFileSync(file, original);
  const database = openDatabase(":memory:"),
    repository = new DiscussionRepository(database, dir);
  try {
    const imported = repository.read(key);
    assert.equal(imported.messages[1].status, "interrupted");
    assert.equal(imported.messages[1].text, "Незавершённый ответ");
    assert.equal(readFileSync(file, "utf8"), original);
    repository.save({ key, messages: [] });
    assert.deepEqual(
      new DiscussionRepository(database, dir).read(key).messages,
      [],
    );
    assert.equal(readFileSync(file, "utf8"), original);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("restart recovers a partial SQLite reply as interrupted without discarding text", () => {
  const dir = mkdtempSync(join(tmpdir(), "frontend-lab-chat-restart-")),
    path = join(dir, "instance.sqlite");
  let database = openDatabase(path);
  try {
    new DiscussionRepository(database).save({
      key: "topic:one",
      messages: [
        { role: "assistant", text: "Часть ответа", status: "pending" },
      ],
    });
    database.close();
    database = openDatabase(path);
    const restored = new DiscussionRepository(database).read("topic:one");
    assert.deepEqual(restored.messages, [
      { role: "assistant", text: "Часть ответа", status: "interrupted" },
    ]);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("corrupt histories remain available for recovery and are never silently replaced", () => {
  const dir = mkdtempSync(join(tmpdir(), "frontend-lab-chat-invalid-")),
    key = "topic:broken";
  const file = join(
    dir,
    createHash("sha256").update(key).digest("hex") + ".json",
  );
  writeFileSync(file, "broken source");
  const database = openDatabase(":memory:"),
    repository = new DiscussionRepository(database, dir);
  try {
    assert.throws(() => repository.read(key));
    assert.equal(readFileSync(file, "utf8"), "broken source");
    assert.equal(
      database
        .prepare("SELECT count(*) FROM discussion_histories")
        .pluck()
        .get(),
      0,
    );
    database
      .prepare("INSERT INTO discussion_histories VALUES (?,?)")
      .run("other", "invalid JSON");
    const reopened = new DiscussionRepository(database);
    assert.throws(() => reopened.read("other"));
    assert.equal(
      database
        .prepare("SELECT body FROM discussion_histories WHERE key='other'")
        .pluck()
        .get(),
      "invalid JSON",
    );
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
