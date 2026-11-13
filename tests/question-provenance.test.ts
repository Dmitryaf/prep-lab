import test from "node:test";
import assert from "node:assert/strict";
import { extractQuestions } from "#domain/knowledge/markdown.ts";
import { selectInterview } from "#domain/interview/selection.ts";
import { withBundledRounds } from "#domain/knowledge/bundled-rounds.ts";
import { compileKnowledge } from "#domain/knowledge/catalog.ts";
import { loadState, validateState } from "#domain/interview/saved-state.ts";

const document = (metadata: string) => ({
  id: "Собеседования/Проектирование/Пример",
  path: "Собеседования/Проектирование/Пример.md",
  title: "Пример",
  category: "Инженерные вопросы",
  markdown: `# Пример\n\n## Сценарий\n${metadata}\n\nСпроектируйте поиск с подсказками.\n\n> [!answer]- Разбор\n> Обсудите требования, API и конкурентные запросы.\n\n**Критерии ответа:** Объяснить компромиссы.`,
});
test("saved snapshots retain obsolete unknown fields while validating eligibility", () => {
  const [q] = extractQuestions(document(""));
  const state = (extra: Record<string, unknown>) => ({
    ...loadState({ getItem: () => null }),
    sessions: {
      s: {
        id: "s",
        kind: "full",
        date: "2026-11-05",
        questionIds: [q.id],
        index: 0,
        finished: false,
        skipped: [],
        ratings: {},
        snapshots: { [q.id]: { ...q, ...extra } },
      },
    },
  });
  for (const extra of [
    {},
    { interviewEligible: false },
    {
      sourceEvidence: {
        kind: "public-task",
        title: "Legacy",
        url: "https://example.com",
      },
    },
    { sourceEvidence: null },
    { sourceEvidence: { kind: "obsolete-format", title: 42 } },
  ]) {
    const original = state(extra);
    assert.deepEqual(
      validateState(original).sessions.s.snapshots,
      original.sessions.s.snapshots,
    );
  }
  for (const interviewEligible of [null, "false", 0])
    assert.throws(() => validateState(state({ interviewEligible })));
});

test("obsolete source metadata does not create a domain field", () => {
  const [q] = extractQuestions(
    document(
      "**Тип источника:** публичная задача\n**Источник задания:** [Old](https://example.com)",
    ),
  );
  assert.equal(Object.hasOwn(q, "sourceEvidence"), false);
  assert(!q.prompt.includes("Тип источника"));
  assert(!q.prompt.includes("Источник задания"));
});

test("an explicit exclusion applies to mixed, daily and specialized interviews without deleting the question", () => {
  const [q] = extractQuestions(
    document("**Формат раунда:** Проектирование\n**Допуск к интервью:** нет"),
  );
  assert.equal(q.interviewEligible, false);
  for (const kind of ["daily", "full"] as const)
    for (const format of ["mixed", "design"] as const)
      assert.deepEqual(
        selectInterview([q], kind, "day", [], {}, "vue", format),
        [],
      );
  assert(q.answer);
});

test("a practical format requires a complete answer and criteria, without source metadata", () => {
  const [q] = extractQuestions(document("**Формат раунда:** Проектирование"));
  assert.equal(
    selectInterview([q], "full", "day", [], {}, "vue", "design").length,
    1,
  );
  for (const extra of [
    { answer: " " },
    { criteria: " " },
    { availableAnswer: false },
  ])
    assert.deepEqual(
      selectInterview(
        [{ ...q, ...extra }],
        "full",
        "day",
        [],
        {},
        "vue",
        "design",
      ),
      [],
    );
});

test("a common exclusion also retires the corresponding legacy task while keeping its answer and ID", () => {
  const personal = compileKnowledge([
    document("**Формат раунда:** Проектирование"),
  ]);
  const shared = compileKnowledge([document("**Допуск к интервью:** нет")]);
  const combined = withBundledRounds(personal, shared);
  assert.equal(combined.questions[0].id, personal.questions[0].id);
  assert.equal(combined.questions[0].answer, personal.questions[0].answer);
  assert.equal(combined.questions[0].interviewEligible, false);
  assert.equal(personal.questions[0].interviewEligible, undefined);
  assert.deepEqual(
    selectInterview(combined.questions, "full", "day", [], {}, "vue", "design"),
    [],
  );
});

test("a completed task supplements an unanswered legacy card without overwriting it", () => {
  const personal = compileKnowledge([document("")]);
  personal.questions[0].answer = "";
  personal.questions[0].availableAnswer = false;
  const shared = compileKnowledge([document("")]);
  const combined = withBundledRounds(personal, shared);
  assert.deepEqual(combined.questions[0], personal.questions[0]);
  const added = combined.questions.find((q) =>
    q.id.startsWith("bundled-rounds:"),
  );
  assert(added?.answer && added.criteria);
  assert.equal(added.title, personal.questions[0].title);
  assert.equal(withBundledRounds(shared, shared).questions.length, 1);
});

test("retained supplements preserve old links after a personal answer is completed without entering new interviews", () => {
  const shared = compileKnowledge([document("")]);
  const personal = structuredClone(shared);
  personal.questions[0].answer = "";
  const old = withBundledRounds(personal, shared).questions[1];
  personal.questions[0].answer = "Мой полный ответ";
  const id = shared.questions[0].id;
  for (const retired of [false, true]) {
    if (retired) shared.questions[0].interviewEligible = false;
    const combined = withBundledRounds(personal, shared, [id, id]);
    assert.equal(combined.questions.length, 2);
    assert.equal(combined.questions[0].answer, "Мой полный ответ");
    const retained = combined.questions.find((q) => q.id === old.id)!;
    assert(retained.answer);
    assert.equal(retained.interviewEligible, false);
    assert(combined.notes.some((note) => note.id === retained.noteId));
    assert(
      !selectInterview(combined.questions, "full", "day", [], {}, "vue").some(
        (q) => q.id === old.id,
      ),
    );
  }
  assert.throws(
    () => withBundledRounds(personal, shared, ["missing"]),
    /Сохранённый вопрос/,
  );
  personal.questions[0].answer = "";
  delete shared.questions[0].interviewEligible;
  const active = withBundledRounds(personal, shared, [id]);
  assert.equal(active.questions.length, 2);
  assert.notEqual(active.questions[1].interviewEligible, false);
});

test("non-round supplements repair only known empty cards and never copy unrelated ready questions", () => {
  const shared = compileKnowledge([document("")]);
  const emptyPersonal = compileKnowledge([]);
  assert.equal(withBundledRounds(emptyPersonal, shared).questions.length, 0);
  const personal = compileKnowledge([document("")]);
  const original = structuredClone(personal);
  assert.equal(withBundledRounds(personal, shared).questions.length, 1);
  assert.deepEqual(personal, original);
  personal.questions[0].answer = "   ";
  assert.equal(withBundledRounds(personal, shared).questions.length, 2);
  shared.questions[0].criteria = "   ";
  assert.equal(withBundledRounds(personal, shared).questions.length, 1);
});

test("round supplements fill incomplete legacy answers but preserve complete current rounds", () => {
  const shared = compileKnowledge([
    document("**Формат раунда:** Проектирование"),
  ]);
  const personal = structuredClone(shared);
  personal.questions[0].answer = "";
  assert.equal(withBundledRounds(personal, shared).questions.length, 2);
  assert.equal(withBundledRounds(shared, shared).questions.length, 1);
  assert.equal(
    withBundledRounds(compileKnowledge([]), shared).questions.length,
    1,
  );
});

test("new non-round exercises accompany a required round note without importing unrelated material", () => {
  const roundNote = document("**Формат раунда:** Проектирование");
  roundNote.markdown +=
    "\n\n## Дополнительная задача\nРешите самостоятельную небольшую задачу.\n\n> [!answer]- Разбор\n> Решение.\n\n**Критерии ответа:** Проверьте границы.";
  const unrelated = {
    ...document(""),
    id: "other",
    path: "Собеседования/Практика/Other.md",
  };
  const shared = compileKnowledge([roundNote, unrelated]);
  const combined = withBundledRounds(compileKnowledge([]), shared);
  assert.equal(combined.questions.length, 2);
  assert(combined.questions.some((q) => q.title === "Дополнительная задача"));
  assert(
    combined.questions.every(
      (q) => q.noteId === `bundled-rounds/${roundNote.id}`,
    ),
  );
});
