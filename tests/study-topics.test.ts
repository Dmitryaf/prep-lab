import test from "node:test";
import assert from "node:assert/strict";
import { studyTopics } from "../domain/knowledge/study-topics.ts";
import type { Question } from "../domain/knowledge/question.ts";
import type { Note } from "../domain/knowledge/material.ts";

test("the sidebar resolves scoped theory links, removes duplicates and cannot link the answer or a missing section", () => {
  const notes: Note[] = [
    {
      id: "rounds/question",
      path: "question.md",
      title: "Задача",
      markdown: "# Задача",
      category: "JavaScript",
      sourceId: "rounds",
    },
    {
      id: "rounds/theory",
      path: "theory.md",
      title: "Promise",
      markdown: "# Promise\n\n## Отмена\nТеория",
      category: "JavaScript",
      sourceId: "rounds",
      headingAliases: { "Старый раздел": "Отмена" },
    },
    {
      id: "theory",
      path: "theory.md",
      title: "Личная версия",
      markdown: "# Другое",
      category: "JavaScript",
    },
  ];
  const question: Question = {
    id: "q",
    title: "Задача",
    prompt: "Условие",
    answer: "Скрытое решение",
    kind: "practice",
    category: "JavaScript",
    source: "knowledge",
    noteId: "rounds/question",
    learningLinks: [
      {
        kind: "theory",
        noteId: "theory",
        heading: "Старый раздел",
        label: "01. Отмена",
      },
      {
        kind: "theory",
        noteId: "rounds/theory",
        heading: "Отмена",
        label: "Дубль",
      },
      {
        kind: "theory",
        noteId: "rounds/theory",
        heading: "Нет раздела",
        label: "Недоступно",
      },
      {
        kind: "theory",
        noteId: "rounds/question",
        heading: "",
        label: "Ответ",
      },
      {
        kind: "practice",
        noteId: "rounds/theory",
        heading: "",
        label: "Задача",
      },
      { kind: "theory", noteId: "missing", heading: "", label: "Нет файла" },
    ],
  };
  assert.deepEqual(studyTopics(question, notes), [
    { noteId: "rounds/theory", heading: "Отмена", title: "Отмена" },
  ]);
  assert.deepEqual(studyTopics({ ...question, learningLinks: [] }, notes), []);
});

test("sidebar labels name the actual note or resolved section instead of a generic link alias", () => {
  const notes: Note[] = [
    {
      id: "promises",
      path: "promises.md",
      title: "02. Promise и обработка ошибок",
      category: "JavaScript",
      markdown:
        "# Promise и обработка ошибок\n\n## Отмена\n### AbortController\nТеория.",
    },
    {
      id: "examples",
      path: "examples.md",
      title: "Объяснение и примеры",
      category: "JavaScript",
      markdown: "# Объяснение и примеры\nПодробности.",
    },
  ];
  const question: Question = {
    id: "q",
    title: "Задача",
    prompt: "Условие",
    answer: "Скрытое решение",
    kind: "practice",
    source: "knowledge",
    category: "JavaScript",
    learningLinks: [
      {
        kind: "theory",
        noteId: "promises",
        heading: "",
        label: "Объяснение и примеры",
      },
      {
        kind: "theory",
        noteId: "promises",
        heading: "Отмена#AbortController",
        label: "Подробнее",
      },
      { kind: "theory", noteId: "examples", heading: "", label: "Прочитать" },
    ],
  };
  assert.deepEqual(studyTopics(question, notes), [
    { noteId: "promises", heading: "", title: "Promise и обработка ошибок" },
    {
      noteId: "promises",
      heading: "Отмена#AbortController",
      title: "AbortController",
    },
    { noteId: "examples", heading: "", title: "Объяснение и примеры" },
  ]);
});
