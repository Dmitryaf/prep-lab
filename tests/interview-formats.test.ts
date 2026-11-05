import test from "node:test";
import assert from "node:assert/strict";
import { extractQuestions } from "../domain/knowledge/markdown.ts";
import {
  selectInterview,
  createSession,
} from "../domain/interview/selection.ts";
import { loadCommonKnowledge } from "../server/infrastructure/knowledge/common.ts";
import { knowledgeForProfile } from "../domain/knowledge/profile.ts";
import {
  availableFollowups,
  openFollowup,
} from "../domain/interview/navigation.ts";

const makeQuestion = (
  id: string,
  roundFormat?: "coding" | "review" | "design",
) => ({
  id,
  title: id,
  prompt: "Выполните задание",
  answer: "Проверенное решение",
  kind:
    roundFormat === "design" ? "design" : roundFormat ? "practice" : "theory",
  category: "JavaScript",
  source: "knowledge",
  criteria: "Объяснить результат проверки",
  curriculumTier: roundFormat ? ("extended" as const) : ("core" as const),
  ...(roundFormat ? { roundFormat } : {}),
});

test("mixed full interviews retain a completed design task when old core cases are retired, without expanding daily scope", () => {
  const core = makeQuestion("theory");
  const retired = {
    ...makeQuestion("old-design", "design"),
    curriculumTier: "core" as const,
    interviewEligible: false,
  };
  const verified = makeQuestion("verified-design", "design");
  const unverified = {
    ...verified,
    id: "unverified",
    answer: " ",
  };
  const questions = [core, retired, verified, unverified];
  const full = selectInterview(questions, "full", "day");
  assert.deepEqual(
    full.filter((q) => q.kind === "design").map((q) => q.id),
    [verified.id],
  );
  assert.deepEqual(
    selectInterview(questions, "daily", "day").map((q) => q.id),
    [core.id],
  );
});

test("round metadata selects the practice format without leaking into the task prompt", () => {
  const [question] = extractQuestions({
    id: "round",
    path: "Собеседования/Практика/JavaScript.md",
    markdown:
      "# Практика\n## Поиск\n**Формат раунда:** coding\n\nНапишите поиск с проверкой позднего ответа.\n\n> [!answer]- Разбор\n> Ответ.\n\n**Критерии ответа:** Сохраняет последний результат.",
  });
  assert.equal(question.roundFormat, "coding");
  assert(!question.prompt.includes("Формат раунда"));
  assert.equal(question.id, "ck:round#Поиск");
});

test("coding round uses completed extended tasks, excludes other formats and never fills with theory", () => {
  const bank = [
    makeQuestion("theory"),
    makeQuestion("code", "coding"),
    makeQuestion("review", "review"),
    { ...makeQuestion("foreign", "coding"), profiles: ["react" as const] },
    { ...makeQuestion("unfinished", "coding"), availableAnswer: false },
    { ...makeQuestion("no-criteria", "coding"), criteria: "" },
  ];
  assert.deepEqual(
    selectInterview(bank, "full", "day", [], {}, "vue", "coding").map(
      (q) => q.id,
    ),
    ["code"],
  );
  assert.deepEqual(
    selectInterview([bank[0]], "full", "day", [], {}, "vue", "coding"),
    [],
  );
});

test("review and design rounds are bounded, deterministic and prioritize questions marked for repetition", () => {
  const bank = [
    makeQuestion("theory"),
    ...["a", "b", "c", "d"].map((id) => makeQuestion(id, "review")),
    makeQuestion("design", "design"),
  ];
  const pick = () =>
    selectInterview(
      bank,
      "full",
      "day",
      [],
      { d: { status: "again" } },
      "vue",
      "review",
    );
  assert.equal(pick().length, 3);
  assert.equal(pick()[0].id, "d");
  assert(pick().every((q) => q.roundFormat === "review"));
  assert.deepEqual(pick(), pick());
  assert.deepEqual(
    selectInterview(bank, "full", "day", [], {}, "vue", "design").map(
      (q) => q.id,
    ),
    ["design"],
  );
});

test("new format is snapshotted without changing the default daily selection", () => {
  const bank = [makeQuestion("theory"), makeQuestion("code", "coding")];
  const session = createSession(bank, "full", {}, "vue", "coding");
  assert.equal(session.format, "coding");
  assert.deepEqual(session.questionIds, ["code"]);
  bank[1].answer = "Changed";
  assert.equal(session.snapshots.code.answer, "Проверенное решение");
  assert.deepEqual(
    selectInterview(bank, "daily", "day", [], {}, "vue", "coding"),
    selectInterview(bank, "daily", "day"),
  );
});

test("both clean profiles supply complete coding, review and design rounds with usable study links", () => {
  const common = loadCommonKnowledge();
  for (const profile of ["vue", "react"] as const) {
    const bank = knowledgeForProfile(common, profile);
    for (const format of ["coding", "review", "design"] as const) {
      const selected = selectInterview(
        bank.questions,
        "full",
        "round",
        [],
        {},
        profile,
        format,
      );
      assert.equal(
        selected.length,
        format === "design" ? 1 : format === "coding" ? 4 : 3,
        `${profile}/${format}`,
      );
      for (const question of selected) {
        assert.equal(question.roundFormat, format);
        assert(question.answer && question.criteria, question.id);
        assert(
          question.learningLinks?.some((link) =>
            bank.notes.some((note) => note.id === link.noteId),
          ),
          question.id,
        );
      }
    }
  }
});

test("practical round followups progressively change conditions in authored order", () => {
  const bank = [
    {
      ...makeQuestion("code", "coding"),
      followups: ["Сначала отмена", "Затем кэш", "Дополнительно"],
    },
  ];
  for (let i = 0; i < 12; i++) {
    const session = {
      ...createSession(bank, "full", {}, "vue", "coding"),
      id: `round:${i}`,
    };
    assert.deepEqual(availableFollowups(session), [0, 1, 2]);
    assert.equal(openFollowup(session).followupIndex, 1);
    assert.equal(openFollowup(openFollowup(session)).followupIndex, 2);
  }
});

test("unknown round metadata cannot become an inherited object property", () => {
  for (const value of ["constructor", "__proto__", "toString", "other"]) {
    const [question] = extractQuestions({
      id: "round",
      path: "Собеседования/Практика/JavaScript.md",
      markdown: `# Практика\n## Поиск\n**Формат раунда:** ${value}\n\nЗадание.\n\n> [!answer]- Разбор\n> Ответ.`,
    });
    assert.equal(question.roundFormat, undefined);
  }
});
