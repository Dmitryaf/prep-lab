import test from "node:test";
import assert from "node:assert/strict";
import { questionApproach } from "#ui/entities/question/lib/approach.ts";
import type { Question } from "#domain/knowledge/question.ts";

const question = (extra: Partial<Question> = {}): Question => ({
  id: "example",
  title: "Как работает замыкание?",
  prompt: "",
  kind: "theory",
  source: "knowledge",
  category: "JavaScript",
  answer: "",
  ...extra,
});

test("guidance follows the task rather than words hidden in its answer", () => {
  assert.equal(questionApproach(question())?.kind, "theory");
  assert.equal(
    questionApproach(question({ answer: "Найдите ошибку: production падает" }))
      ?.kind,
    "theory",
  );
  assert.equal(
    questionApproach(
      question({
        kind: "practice",
        roundFormat: "coding",
        title: "Поиск пользователей",
      }),
    )?.kind,
    "coding",
  );
  assert.equal(
    questionApproach(
      question({
        kind: "practice",
        roundFormat: "review",
        title: "Клиент API",
      }),
    )?.kind,
    "review",
  );
  assert.equal(
    questionApproach(question({ kind: "design", title: "Каталог товаров" }))
      ?.kind,
    "design",
  );
  assert.equal(
    questionApproach(
      question({
        kind: "practice",
        title: "Ошибка только в production",
        noteId: "Собеседования/Практика/Диагностика",
      }),
    )?.kind,
    "diagnosis",
  );
});

test("a theoretical followup of a coding task gets its own approach", () => {
  const q = question({
    kind: "practice",
    roundFormat: "coding",
    title: "Почему поздний ответ нельзя применять?",
  });
  assert.equal(questionApproach(q, true)?.kind, "theory");
  assert.equal(
    questionApproach({ ...q, title: "Добавь отмену запроса" }, true)?.kind,
    "coding",
  );
});

test("legacy practice metadata distinguishes discussion from writing code", () => {
  assert.equal(
    questionApproach(
      question({
        kind: "practice",
        title: "COUNT(*) и COUNT(column)",
        noteId: "Собеседования/Практика/Инженерные вопросы",
      }),
    )?.kind,
    "theory",
  );
  assert.equal(
    questionApproach(
      question({
        kind: "practice",
        title: "Проверка компонента: подписки, шаблон и DI",
      }),
    )?.kind,
    "review",
  );
  assert.equal(
    questionApproach(
      question({
        kind: "practice",
        title: "Выбор подхода",
        noteId: "Собеседования/Практика/Инженерные решения",
      }),
    )?.kind,
    "design",
  );
});

test("HR receives no technical guide and unknown legacy kinds get a general guide", () => {
  assert.equal(questionApproach(question({ kind: "behavioral" })), null);
  assert.equal(
    questionApproach(question({ category: "Поведенческие вопросы" })),
    null,
  );
  assert.equal(
    questionApproach(question({ kind: "legacy", title: "Задание" }))?.kind,
    "general",
  );
});
