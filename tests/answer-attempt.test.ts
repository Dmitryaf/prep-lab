import test from "node:test";
import assert from "node:assert/strict";
import {
  loadState,
  validateState,
  importState,
} from "../domain/interview/saved-state.ts";
import { mergeLegacyState } from "../domain/interview/migration.ts";
import { openDatabase } from "../server/infrastructure/storage/database.ts";
import {
  PreparationRepository,
  RevisionConflict,
} from "../server/infrastructure/storage/preparation.ts";

const empty = () => loadState({ getItem: () => null });
const draft = {
  text: "Сначала проверю входные данные.\nconst answer = 42;",
  solutionUrl: "https://example.com/solution",
  updatedAt: "2026-11-05T10:00:00.000Z",
};
const session = () => ({
  id: "full:attempt",
  kind: "full" as const,
  format: "review" as const,
  date: "2026-11-05",
  questionIds: ["q"],
  index: 0,
  finished: false,
  snapshots: {
    q: {
      id: "q",
      title: "Вопрос",
      prompt: "Исправьте код",
      answer: "Эталон",
      kind: "practice",
      source: "knowledge",
      category: "JavaScript",
    },
  },
  ratings: {},
  skipped: [],
  attempts: { q: draft },
});

test("saved preparation retains separate practice and interview attempts without changing legacy state", () => {
  const original = {
    ...empty(),
    practiceAttempts: { q: draft },
    sessions: { "full:attempt": session() },
  };
  const parsed = validateState(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(parsed.practiceAttempts, { q: draft });
  assert.deepEqual(parsed.sessions["full:attempt"].attempts, { q: draft });
  assert.equal(parsed.sessions["full:attempt"].format, "review");
  assert.deepEqual(validateState(empty()), empty());
  assert.deepEqual(original.practiceAttempts.q, draft);
});

test("invalid or oversized attempts and unknown round formats cannot enter saved preparation", () => {
  for (const attempt of [
    null,
    { ...draft, text: "a".repeat(20_001) },
    { ...draft, solutionUrl: "javascript:alert(1)" },
    { ...draft, solutionUrl: "https://example.com/" + "x".repeat(2_000) },
    { ...draft, text: 2 },
    { ...draft, updatedAt: false },
  ]) {
    assert.throws(() =>
      validateState({ ...empty(), practiceAttempts: { q: attempt } }),
    );
    assert.throws(() =>
      validateState({
        ...empty(),
        sessions: {
          "full:attempt": { ...session(), attempts: { q: attempt } },
        },
      }),
    );
  }
  assert.throws(() =>
    validateState({
      ...empty(),
      practiceAttempts: JSON.parse('{"__proto__":{}}'),
    }),
  );
  assert.throws(() =>
    validateState({
      ...empty(),
      sessions: {
        "full:attempt": { ...session(), attempts: { other: draft } },
      },
    }),
  );
  assert.throws(() =>
    validateState({
      ...empty(),
      sessions: { "full:attempt": { ...session(), format: "unknown" } },
    }),
  );
  const broken = session();
  assert.throws(() =>
    validateState({
      ...empty(),
      sessions: {
        "full:attempt": {
          ...broken,
          snapshots: { q: { ...broken.snapshots.q, roundFormat: "unknown" } },
        },
      },
    }),
  );
});

test("import and one-time migration preserve attempts with their established precedence", () => {
  const current = {
    ...empty(),
    practiceAttempts: { q: draft, currentOnly: draft },
  };
  const incoming = {
    ...empty(),
    practiceAttempts: { q: { ...draft, text: "Импорт" }, incomingOnly: draft },
  };
  assert.equal(
    importState(JSON.stringify(incoming), current).practiceAttempts?.q.text,
    "Импорт",
  );
  assert.deepEqual(mergeLegacyState(current, incoming).practiceAttempts, {
    q: draft,
    currentOnly: draft,
    incomingOnly: draft,
  });
});

test("SQLite atomically persists attempts with revision protection and rejects failed writes", () => {
  const database = openDatabase(":memory:");
  const repository = new PreparationRepository(database);
  try {
    const first = repository.save(
      {
        ...empty(),
        practiceAttempts: { q: draft },
        sessions: { "full:attempt": session() },
      },
      0,
    );
    assert.deepEqual(repository.read().state.practiceAttempts, { q: draft });
    assert.deepEqual(
      repository.read().state.sessions["full:attempt"].attempts,
      { q: draft },
    );
    assert.throws(
      () =>
        repository.save(
          {
            ...first.state,
            practiceAttempts: { q: { ...draft, text: "Устаревшая вкладка" } },
          },
          0,
        ),
      RevisionConflict,
    );
    assert.deepEqual(repository.read(), first);
    database.exec(
      "CREATE TRIGGER fail_attempt BEFORE UPDATE ON instance_meta WHEN NEW.key='practice_attempts' BEGIN SELECT RAISE(ABORT, 'attempt write failure'); END",
    );
    assert.throws(
      () =>
        repository.save(
          {
            ...first.state,
            practiceAttempts: { q: { ...draft, text: "Новая попытка" } },
            questionProgress: { q: { status: "done" } },
          },
          1,
        ),
      /attempt write failure/,
    );
    assert.deepEqual(repository.read(), first);
  } finally {
    database.close();
  }
});

test("a corrupt empty attempt record cannot be read as an empty draft or overwritten", () => {
  const database = openDatabase(":memory:");
  const repository = new PreparationRepository(database);
  try {
    repository.save({ ...empty(), practiceAttempts: { q: draft } }, 0);
    database
      .prepare(
        "UPDATE instance_meta SET value='' WHERE key='practice_attempts'",
      )
      .run();
    assert.throws(() => repository.read());
    assert.throws(() => repository.save(empty(), 1));
    assert.equal(
      database
        .prepare(
          "SELECT value FROM instance_meta WHERE key='practice_attempts'",
        )
        .pluck()
        .get(),
      "",
    );
    assert.equal(
      database
        .prepare(
          "SELECT value FROM instance_meta WHERE key='preparation_revision'",
        )
        .pluck()
        .get(),
      "1",
    );
  } finally {
    database.close();
  }
});
