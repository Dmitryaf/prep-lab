import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import {
  PreparationRepository,
  RevisionConflict,
} from "#server/infrastructure/storage/preparation.ts";
import { loadState } from "#domain/interview/saved-state.ts";
import { dailySession } from "#domain/interview/selection.ts";

const empty = () => loadState({ getItem: () => null });
test("v1 and v2 browser marks migrate through the same validated adapter", () => {
  for (const [key, value] of [
    ["project-map-review-v1", { oldTopic: { status: "again" } }],
    [
      "project-map-review-v2",
      {
        version: 2,
        progress: { oldTopic: { status: "again" } },
        questionProgress: { oldQuestion: { status: "partial" } },
      },
    ],
  ] as const) {
    const original = JSON.stringify(value);
    const database = openDatabase(":memory:");
    try {
      const migrated = new PreparationRepository(database).migrate(
        loadState({
          getItem: (requested) => (requested === key ? original : null),
        }),
      );
      assert.equal(migrated.state.progress.oldTopic.status, "again");
      if (key.endsWith("v2"))
        assert.equal(
          migrated.state.questionProgress.oldQuestion.status,
          "partial",
        );
    } finally {
      database.close();
    }
  }
});
test("SQLite preserves legacy unknown IDs across reconnects without restoring cleared repeats", () => {
  const dir = mkdtempSync(join(tmpdir(), "frontend-lab-sqlite-")),
    path = join(dir, "instance.sqlite");
  let database = openDatabase(path),
    repository = new PreparationRepository(database);
  try {
    const original = {
      ...empty(),
      questionProgress: { "removed-question": { status: "again" as const } },
      progress: { "removed-topic": { status: "partial" as const } },
    };
    const migrated = repository.migrate(original);
    assert.equal(
      migrated.state.questionProgress["removed-question"].status,
      "again",
    );
    repository.save(
      {
        ...migrated.state,
        questionProgress: { "removed-question": { status: "done" } },
      },
      migrated.revision,
    );
    database.close();
    database = openDatabase(path);
    repository = new PreparationRepository(database);
    const current = repository.migrate(original);
    assert.equal(current.revision, 2);
    assert.equal(
      current.state.questionProgress["removed-question"].status,
      "done",
    );
    assert.equal(current.state.progress["removed-topic"].status, "partial");
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("two SQLite connections reject an outdated write without changing the accepted state", () => {
  const dir = mkdtempSync(join(tmpdir(), "frontend-lab-tabs-")),
    path = join(dir, "instance.sqlite");
  const first = openDatabase(path),
    second = openDatabase(path);
  try {
    const a = new PreparationRepository(first),
      b = new PreparationRepository(second);
    a.save({ ...empty(), questionProgress: { one: { status: "again" } } }, 0);
    assert.throws(
      () =>
        b.save(
          { ...empty(), questionProgress: { two: { status: "done" } } },
          0,
        ),
      RevisionConflict,
    );
    assert.deepEqual(a.read(), b.read());
    assert.equal(a.read().state.questionProgress.one.status, "again");
  } finally {
    first.close();
    second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("failed writes roll back every record and revision; invalid input remains unapplied", () => {
  const database = openDatabase(":memory:"),
    repository = new PreparationRepository(database);
  try {
    const before = repository.save(
      { ...empty(), questionProgress: { original: { status: "partial" } } },
      0,
    );
    database.exec(
      "CREATE TRIGGER fail_write BEFORE INSERT ON topic_marks BEGIN SELECT RAISE(ABORT, 'test write failure'); END",
    );
    assert.throws(
      () =>
        repository.save(
          { ...before.state, progress: { new: { status: "done" } } },
          1,
        ),
      /test write failure/,
    );
    assert.deepEqual(repository.read(), before);
    assert.throws(() => repository.save({ version: 999 }, 1));
    assert.deepEqual(repository.read(), before);
    database.exec("DROP TRIGGER fail_write");
    assert.equal(repository.save(before.state, 1).revision, 2);
  } finally {
    database.close();
  }
});
test("old interview snapshots retain their original answers and position", () => {
  const database = openDatabase(":memory:"),
    repository = new PreparationRepository(database);
  try {
    const state = dailySession(
      empty(),
      [
        {
          id: "old",
          title: "Старый вопрос",
          prompt: "Старый текст",
          answer: "Исторический ответ",
          kind: "theory",
          source: "knowledge",
          category: "JavaScript",
        },
      ],
      "2026-11-03",
    );
    repository.migrate(state);
    const restored = repository.read().state.daily["2026-11-03"];
    assert.equal(restored.snapshots.old.answer, "Исторический ответ");
    assert.equal(restored.index, 0);
  } finally {
    database.close();
  }
});
test("a corrupt database is reported without replacing its original bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "frontend-lab-corrupt-")),
    path = join(dir, "instance.sqlite");
  try {
    writeFileSync(path, "damaged original");
    assert.throws(() => openDatabase(path));
    assert.equal(readFileSync(path, "utf8"), "damaged original");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing table in an existing database is not recreated as empty state", () => {
  const dir = mkdtempSync(join(tmpdir(), "frontend-lab-schema-")),
    path = join(dir, "instance.sqlite");
  try {
    const database = openDatabase(path);
    database.exec("DROP TABLE question_marks");
    database.close();
    const before = readFileSync(path);
    assert.throws(
      () => openDatabase(path),
      /Структура файла данных повреждена/,
    );
    assert.deepEqual(readFileSync(path), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
