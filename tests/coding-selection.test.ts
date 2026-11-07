import test from "node:test";
import assert from "node:assert/strict";
import type { Question } from "#domain/knowledge/question.ts";
import { createSession, selectInterview } from "#domain/interview/selection.ts";
import {
  availableFollowups,
  openFollowup,
  advanceQuestion,
  previousQuestion,
} from "#domain/interview/navigation.ts";

function task(
  id: string,
  codingRole: "short" | "main" | "advanced",
  category = "JavaScript",
): Question {
  return {
    id,
    title: id,
    prompt: "Реализуйте функцию.",
    answer: "Решение.",
    criteria: "Верный результат.",
    kind: "practice",
    source: "knowledge",
    category,
    roundFormat: "coding",
    codingRole,
  };
}
const bank = [
  ...Array.from({ length: 6 }, (_, i) => task(`js${i}`, "short")),
  task("ts1", "short", "TypeScript"),
  task("ts2", "short", "TypeScript"),
  task("vue", "main", "Vue"),
  task("react", "main", "React"),
  task("async", "main"),
  task("data", "main"),
  task("lru", "advanced"),
];

test("coding rounds reserve three short tasks and one main task in each profile", () => {
  for (const profile of ["vue", "react"] as const) {
    const chosen = selectInterview(
      bank,
      "full",
      "seed",
      [],
      {},
      profile,
      "coding",
    );
    assert.deepEqual(
      chosen.map((q) => q.codingRole),
      ["short", "short", "short", "main"],
    );
    assert.equal(new Set(chosen.map((q) => q.id)).size, 4);
    assert.equal(new Set(chosen.slice(0, 3).map((q) => q.category)).size, 2);
    assert(
      !chosen.some((q) => q.category === (profile === "vue" ? "React" : "Vue")),
    );
  }
});

test("recent coding tasks yield to unused tasks, including bundled aliases and weak answers", () => {
  const first = selectInterview(bank, "full", "seed", [], {}, "vue", "coding");
  const history = [{ questionIds: first.map((q) => `bundled-rounds:${q.id}`) }];
  const weak = Object.fromEntries(
    first.map((q) => [q.id, { status: "again" as const }]),
  );
  const second = selectInterview(
    bank,
    "full",
    "seed",
    history,
    weak,
    "vue",
    "coding",
  );
  assert(second.every((q) => !first.some((old) => old.id === q.id)));
  const session = createSession(bank, "full", weak, "vue", "coding", history);
  assert(session.questionIds.every((id) => !first.some((q) => q.id === id)));
});

test("a sparse coding bank keeps roles and never pads with advanced or theory", () => {
  const chosen = selectInterview(
    [
      task("short", "short"),
      task("main", "main"),
      task("hard", "advanced"),
      { ...task("theory", "short"), kind: "theory" },
    ],
    "full",
    "seed",
    [],
    {},
    "vue",
    "coding",
  );
  assert.deepEqual(
    chosen.map((q) => q.id),
    ["short", "main"],
  );
  assert.deepEqual(
    selectInterview(
      [task("hard", "advanced")],
      "full",
      "seed",
      [],
      {},
      "vue",
      "coding",
    ),
    [],
  );
});

test("staged coding extensions are available without an attempt and preserve historical answers", () => {
  const question = {
    ...task("code", "main"),
    followups: ["Добавьте отмену", "Добавьте кэш"],
  };
  const session = createSession([question], "full", {}, "vue", "coding");
  assert.deepEqual(availableFollowups(session), [0, 1]);
  assert.equal(openFollowup(session).followupIndex, 1);
  const empty = {
    ...session,
    attempts: { code: { text: "  ", solutionUrl: "", updatedAt: "today" } },
  };
  assert.deepEqual(availableFollowups(empty), [0, 1]);
  const answered = {
    ...empty,
    attempts: { code: { ...empty.attempts.code, text: "Моё решение" } },
  };
  assert.deepEqual(availableFollowups(answered), [0, 1]);
  assert.equal(openFollowup(answered).followupIndex, 1);
  const done = advanceQuestion(answered);
  assert(done.finished);
  assert.deepEqual(done.skipped, []);
  assert.equal(done.attempts?.code.text, "Моё решение");
  assert.equal(session.attempts, undefined);
});

test("all authored coding stages are reachable without changing the legacy followup cap", () => {
  const question = {
    ...task("code", "main"),
    followups: ["Кэш", "Общий запрос", "Сброс кэша"],
  };
  const session = createSession([question], "full", {}, "vue", "coding");
  session.attempts = {
    code: { text: "Решение базы", solutionUrl: "", updatedAt: "today" },
  };
  const second = openFollowup(openFollowup(session));
  assert.deepEqual(availableFollowups(second), [2]);
  const third = openFollowup(second);
  assert.equal(third.followupIndex, 3);
  assert.deepEqual(availableFollowups(third), []);
  const base = previousQuestion(third);
  const revisited = openFollowup(base, 0);
  assert.equal(revisited.followupIndex, 1);
  assert.deepEqual(revisited.followupChoices?.code, [0, 1, 2]);
  assert.equal(openFollowup(base, -1), base);
  assert.equal(openFollowup(base, 3), base);
  const finished = advanceQuestion(revisited, true);
  assert(finished.finished);
  assert.deepEqual(finished.skipped, []);
});
