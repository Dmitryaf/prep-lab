import test from "node:test";
import assert from "node:assert/strict";
import { createSession, selectInterview } from "#domain/interview/selection.ts";
import {
  availableFollowups,
  openFollowup,
  previousQuestion,
  advanceQuestion,
  finishInterview,
} from "#domain/interview/navigation.ts";
import type { Question } from "#domain/knowledge/question.ts";

const question = (
  id: string,
  kind = "theory",
  category = "JavaScript",
): Question => ({
  id,
  kind,
  category,
  title: id,
  prompt: id,
  answer: "Ответ",
  criteria: "Критерий",
  source: "knowledge",
  curriculumTier: "core",
});

test("testing exercises are excluded from daily, mixed and coding interviews while testing theory stays", () => {
  const exercise = {
    ...question("testing-task", "practice", "Тестирование"),
    roundFormat: "coding" as const,
    codingRole: "main" as const,
  };
  const theory = question("testing-theory", "theory", "Тестирование");
  for (const kind of ["daily", "full"] as const) {
    const chosen = selectInterview([exercise, theory], kind, "date");
    assert(!chosen.some((q) => q.id === exercise.id));
    assert(chosen.some((q) => q.id === theory.id));
  }
  assert.equal(
    selectInterview([exercise], "full", "date", [], {}, "vue", "coding").length,
    0,
  );
});

for (const kind of ["daily", "full"] as const)
  test(`${kind}: a consumed followup reopens after returning to the main question, reload and next/back`, () => {
    const root = {
      ...question("root"),
      followups: ["Первое уточнение", "Второе уточнение", "Третье уточнение"],
    };
    let session = createSession([root, question("other")], kind);
    session.questionIds = ["root", "other"];
    const limit = kind === "daily" ? 1 : 2;
    for (let i = 0; i < limit; i++) session = openFollowup(session);
    assert.equal(availableFollowups(session).length, 0);
    const original = structuredClone(session);
    assert.equal(openFollowup(session), session);
    for (let visit = 0; visit < 4; visit++) {
      const main = JSON.parse(JSON.stringify(previousQuestion(session)));
      assert.equal(main.followupIndex, 0);
      session = openFollowup(main);
      assert.equal(session.followupIndex, original.followupIndex);
      assert.deepEqual(session.followupChoices, original.followupChoices);
      assert.deepEqual(session.questionIds, original.questionIds);
      assert.deepEqual(session.snapshots, original.snapshots);
      assert.deepEqual(session.ratings, original.ratings);
      assert.deepEqual(session.skipped, original.skipped);
    }
    session = openFollowup(previousQuestion(advanceQuestion(session)));
    assert.equal(session.followupIndex, original.followupIndex);
    const finished = finishInterview(session);
    assert.equal(openFollowup(finished), finished);
  });

test("legacy followupIndex can reopen after returning without inventing more choices", () => {
  const root = {
    ...question("root"),
    followups: ["Первое", "Второе", "Третье"],
  };
  const session = createSession([root], "daily");
  session.followupIndex = 2;
  const main = previousQuestion(session);
  const reopened = openFollowup(main);
  assert.equal(reopened.followupIndex, 2);
  assert.deepEqual(reopened.followupChoices?.root, [0, 1]);
});
