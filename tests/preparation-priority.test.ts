import test from "node:test";
import assert from "node:assert/strict";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { withBundledRounds } from "#domain/knowledge/bundled-rounds.ts";
import {
  knowledgeForProfile,
  supportsQuestion,
} from "#domain/knowledge/profile.ts";
import { createSession, selectInterview } from "#domain/interview/selection.ts";
import {
  availableFollowups,
  openFollowup,
} from "#domain/interview/navigation.ts";
import { validateState } from "#domain/interview/saved-state.ts";
import { preparedQuestionSchema } from "#domain/knowledge/contracts.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";
import type { PreparedQuestion } from "#domain/knowledge/question.ts";

const question: PreparedQuestion = {
  id: "q",
  title: "Вопрос",
  prompt: "Условие",
  answer: "Разбор",
  kind: "theory",
  source: "knowledge",
  category: "JavaScript",
  criteria: "Проверка",
  followups: ["Основа", "Углубление", "Основа без ответа"],
  followupAnswers: [
    { title: "Основа", answer: "Базовый разбор" },
    { title: "Углубление", answer: "Подробный разбор" },
  ],
  learningLinks: [],
};
const knowledge = (questions: PreparedQuestion[]): Knowledge => ({
  questions,
  notes: [],
  route: [],
  warnings: [],
});
function saved(q: PreparedQuestion) {
  return {
    version: 3,
    progress: {},
    questionProgress: {},
    daily: {},
    activeSession: "old",
    sessions: {
      old: {
        id: "old",
        kind: "full",
        date: "2026-01-01",
        questionIds: [q.id],
        index: 0,
        finished: false,
        skipped: [],
        ratings: {},
        snapshots: { [q.id]: q },
      },
    },
  };
}

test("new mixed sessions use answered basic followups while the bank retains every explanation", () => {
  const current = {
    ...question,
    interviewFollowups: ["Основа", "Основа без ответа"],
  };
  const before = structuredClone(current);
  for (const kind of ["daily", "full"] as const) {
    const session = createSession([current], kind);
    assert.deepEqual(session.snapshots.q.followups, ["Основа"]);
    assert.equal(openFollowup(session).followupIndex, 1);
  }
  assert.deepEqual(current, before);
  assert.equal(current.followupAnswers?.length, 2);
});

test("unclassified personal questions and specialized coding retain their existing stages", () => {
  assert.deepEqual(createSession([question]).snapshots.q.followups, [
    "Основа",
    "Углубление",
  ]);
  const coding = {
    ...question,
    kind: "practice",
    roundFormat: "coding" as const,
    codingRole: "main" as const,
    interviewFollowups: ["Основа"],
  };
  assert.deepEqual(
    createSession([coding], "full", {}, "vue", "coding").snapshots.q.followups,
    ["Основа", "Углубление"],
  );
  assert.deepEqual(
    createSession([{ ...question, interviewFollowups: [] }]).snapshots.q
      .followups,
    [],
  );
});

test("legacy snapshots keep deep followups and positions after current priorities change", () => {
  const original = saved(structuredClone(question));
  const state = validateState(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(state.sessions.old.snapshots.q, question);
  assert(availableFollowups(state.sessions.old).includes(1));
  assert.equal(openFollowup(state.sessions.old, 1).followupIndex, 2);
  assert.deepEqual(state, original);
});

test("priority metadata survives contracts and corrupted saved metadata is rejected", () => {
  const current = {
    ...question,
    interviewFollowups: ["Основа"],
    interviewDiagnostic: true,
  };
  assert.deepEqual(preparedQuestionSchema.parse(current), current);
  assert.deepEqual(
    validateState(saved(current)).sessions.old.snapshots.q,
    current,
  );
  for (const bad of [
    { interviewFollowups: [12] },
    { interviewDiagnostic: "yes" },
  ]) {
    assert.throws(() => preparedQuestionSchema.parse({ ...question, ...bad }));
    assert.throws(() =>
      validateState(
        saved({ ...question, ...bad } as unknown as PreparedQuestion),
      ),
    );
  }
});

test("shared priorities reach matching personal cards without replacing their text or inventing renamed stages", () => {
  const personal = knowledge([{ ...question, answer: "Личное объяснение" }]);
  const shared = knowledge([
    { ...question, interviewFollowups: ["Основа"], interviewDiagnostic: true },
  ]);
  const before = structuredClone(personal);
  const merged = withBundledRounds(personal, shared).questions[0]!;
  assert.equal(merged.answer, "Личное объяснение");
  assert.deepEqual(merged.interviewFollowups, ["Основа"]);
  assert.equal(merged.interviewDiagnostic, true);
  assert.deepEqual(personal, before);
  const renamed = knowledge([{ ...question, followups: ["Свой вопрос"] }]);
  assert.equal(
    withBundledRounds(renamed, shared).questions[0]!.interviewFollowups,
    undefined,
  );
});

for (const profile of ["vue", "react"] as const) {
  test(`${profile}: diagnosis shares the practical budget and daily sessions alternate with ordinary practice`, () => {
    const bank = knowledgeForProfile(loadCommonKnowledge(), profile);
    const diagnostics = bank.questions.filter((q) => q.interviewDiagnostic);
    assert.equal(diagnostics.length, 3);
    let dailyWith = 0,
      dailyWithout = 0;
    for (let seed = 0; seed < 50; seed++) {
      const full = selectInterview(
        bank.questions,
        "full",
        String(seed),
        [],
        {},
        profile,
      );
      assert.equal(full.length, 20);
      assert.equal(full.filter((q) => q.interviewDiagnostic).length, 1);
      assert(full.some((q) => q.kind === "practice" && !q.interviewDiagnostic));
      assert(full.every((q) => supportsQuestion(q, profile)));
      assert(
        !full.some(
          (q) => q.kind === "practice" && q.category === "Тестирование",
        ),
      );
      const daily = selectInterview(
        bank.questions,
        "daily",
        String(seed),
        [],
        {},
        profile,
      );
      assert.equal(daily.length, 11);
      const count = daily.filter((q) => q.interviewDiagnostic).length;
      assert(count <= 1);
      if (count) dailyWith++;
      else dailyWithout++;
    }
    assert(dailyWith > 0 && dailyWithout > 0);
  });
}

test("diagnostic selection still respects profile, retirement and missing answers", () => {
  const base = knowledgeForProfile(loadCommonKnowledge(), "vue");
  const regular = base.questions.filter((q) => !q.interviewDiagnostic);
  const candidates = [
    {
      ...question,
      id: "foreign",
      kind: "practice",
      interviewDiagnostic: true,
      profiles: ["react" as const],
    },
    {
      ...question,
      id: "retired",
      kind: "practice",
      interviewDiagnostic: true,
      interviewEligible: false,
    },
    {
      ...question,
      id: "empty",
      kind: "practice",
      interviewDiagnostic: true,
      answer: "",
      availableAnswer: false,
    },
  ];
  const selected = selectInterview(
    [...regular, ...candidates],
    "full",
    "fixed",
  );
  assert.equal(selected.length, 20);
  assert(!selected.some((q) => candidates.some((c) => c.id === q.id)));
});

test("daily diagnosis preserves ordinary practice and personal design rotation", () => {
  const theory = { ...question, curriculumTier: "core" as const };
  const practice = { ...theory, id: "practice", kind: "practice" };
  const design = { ...theory, id: "design", kind: "design" };
  const diagnostic = {
    ...practice,
    id: "diagnostic",
    interviewDiagnostic: true,
  };
  for (const ordinary of [[practice, design], [design]]) {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const selected = selectInterview(
        [theory, ...ordinary, diagnostic],
        "daily",
        String(seed),
      );
      const practical = selected.filter((q) => q.kind !== "theory");
      assert.equal(practical.length, 1);
      seen.add(practical[0]!.id);
    }
    assert.deepEqual(
      seen,
      new Set([...ordinary.map((q) => q.id), diagnostic.id]),
    );
  }
});
