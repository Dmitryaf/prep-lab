import test from "node:test";
import assert from "node:assert/strict";
import { extractQuestions } from "#domain/knowledge/markdown.ts";
import { preparedQuestionSchema } from "#domain/knowledge/contracts.ts";
import { cleanEditorialNotes } from "#domain/knowledge/editorial-notes.ts";
import { validateState } from "#domain/interview/saved-state.ts";

const note = (markdown: string) => ({
  id: "Собеседования/Практика/Пример",
  path: "Собеседования/Практика/Пример.md",
  markdown,
});
const base = (role: string) =>
  `## Поиск\n**Формат раунда:** Написание кода\n**Этап кода:** ${role}\n\nНайдите элементы по заданному текстовому запросу.\n\n> [!answer]- Ответ\n> Базовое решение.\n\n**Критерии ответа:** Отбор по запросу.`;

test("coding roles are parsed without exposing the marker in the task or rendered lesson", () => {
  for (const role of ["short", "main", "advanced"] as const) {
    const [question] = extractQuestions(note(base(role)));
    assert.equal(question.codingRole, role);
    assert.equal(question.roundFormat, "coding");
    assert.equal(
      question.prompt,
      "Поиск\n\nНайдите элементы по заданному текстовому запросу.",
    );
    assert.doesNotMatch(cleanEditorialNotes(base(role)), /Этап кода/);
    assert.equal(preparedQuestionSchema.parse(question).codingRole, role);
  }
  const [unknown] = extractQuestions(note(base("other")));
  assert.equal(unknown.codingRole, undefined);
  assert.doesNotMatch(unknown.prompt, /Этап кода/);
  assert.equal(
    preparedQuestionSchema.safeParse({ ...unknown, codingRole: "other" })
      .success,
    false,
  );
});

test("an optional stage keeps its own prompt and criteria without leaking its solution into the base", () => {
  const questions = extractQuestions(
    note(
      `${base("main")}\n\n### Пагинация\nДобавьте переходы между страницами; при новом запросе начинайте с первой.\n\n> [!answer]- Ответ\n> Решение усложнения.\n\n**Критерии ответа:** Границы страниц и сброс при новом запросе.`,
    ),
  );
  const [parent, child] = questions;
  assert.equal(parent.answer, "Базовое решение.");
  assert.equal(parent.criteria, "Отбор по запросу.");
  assert.equal(child.parentId, parent.id);
  assert.deepEqual(parent.followups, ["Пагинация"]);
  assert.deepEqual(parent.followupAnswers, [
    {
      title: "Пагинация",
      prompt:
        "Пагинация\n\nДобавьте переходы между страницами; при новом запросе начинайте с первой.",
      criteria: "Границы страниц и сброс при новом запросе.",
      answer: "Решение усложнения.",
    },
  ]);
  assert.deepEqual(
    preparedQuestionSchema.parse(parent).followupAnswers,
    parent.followupAnswers,
  );
});

test("coding marker examples inside code remain literal, without changing the role", () => {
  const markdown = `${base("main")}\n\n\`\`\`md\n**Этап кода:** advanced\n\`\`\``;
  const [question] = extractQuestions(note(markdown));
  assert.equal(question.codingRole, "main");
  assert.match(question.answer, /\*\*Этап кода:\*\* advanced/);
  assert.match(cleanEditorialNotes(markdown), /\*\*Этап кода:\*\* advanced/);
});

function saved(question: unknown) {
  return {
    version: 3,
    progress: {},
    questionProgress: {},
    sessions: {
      old: {
        id: "old",
        kind: "full",
        date: "2026-01-01",
        questionIds: ["q"],
        index: 0,
        finished: false,
        skipped: [],
        ratings: {},
        snapshots: { q: question },
      },
    },
    daily: {},
    activeSession: "old",
  };
}
const legacyQuestion = {
  id: "q",
  title: "Историческая задача",
  prompt: "Прежнее условие",
  answer: "Прежний ответ",
  followups: ["Уточнение"],
  followupAnswers: [{ title: "Уточнение", answer: "Прежний разбор" }],
};

test("saved questions preserve legacy snapshots and the new optional stage fields", () => {
  const legacy = saved(legacyQuestion);
  assert.deepEqual(
    validateState(legacy).sessions.old.snapshots.q,
    legacyQuestion,
  );
  const question = {
    ...legacyQuestion,
    codingRole: "main",
    followupAnswers: [
      {
        title: "Уточнение",
        answer: "Разбор",
        prompt: "Новое условие",
        criteria: "Отдельный критерий",
      },
    ],
  };
  assert.deepEqual(
    validateState(JSON.parse(JSON.stringify(saved(question)))).sessions.old
      .snapshots.q,
    question,
  );
});

test("saved questions reject invalid roles and optional stage fields instead of accepting corrupted history", () => {
  assert.throws(
    () => validateState(saved({ ...legacyQuestion, codingRole: "other" })),
    /этап/i,
  );
  for (const field of ["prompt", "criteria"])
    assert.throws(
      () =>
        validateState(
          saved({
            ...legacyQuestion,
            followupAnswers: [
              { title: "Уточнение", answer: "Разбор", [field]: 123 },
            ],
          }),
        ),
      /уточнения/i,
    );
});
