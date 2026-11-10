import test from "node:test";
import assert from "node:assert/strict";
import { extractQuestions } from "#domain/knowledge/markdown.ts";
import { followupQuestion } from "#domain/knowledge/followup.ts";
import { createSession } from "#domain/interview/selection.ts";
import {
  openFollowup,
  previousQuestion,
} from "#domain/interview/navigation.ts";

const markdown = `# Vue
## Как работает реактивность?
> [!answer]- Ответ
> Vue отслеживает обращения к свойствам.

**Уточнения**
- Чем отличается прокси?
- Пока без ответа?

> [!followup]- Чем отличается прокси?
>
> Прокси — отдельный объект.
> \`\`\`js
> console.log(proxy === original); // false
> \`\`\`
`;
const read = (text = markdown) =>
  extractQuestions({
    id: "vue",
    path: "Собеседования/Темы/Vue.md",
    markdown: text,
  });

test("dedicated followup callouts have their own answers without becoming questions or leaking into the main answer", () => {
  const [question] = read();
  assert.equal(read().length, 1);
  assert.equal(question.shortAnswer, "Vue отслеживает обращения к свойствам.");
  assert(!question.answer.includes("Прокси — отдельный"));
  assert.deepEqual(question.followups, [
    "Чем отличается прокси?",
    "Пока без ответа?",
  ]);
  const selected = followupQuestion(question, 1)!;
  assert.equal(selected.title, "Чем отличается прокси?");
  assert(selected.answer.includes("console.log"));
  assert.equal(selected.criteria, "");
  assert.deepEqual(selected.followups, []);
  assert.equal(followupQuestion(question, 2)?.availableAnswer, false);
  assert.equal(followupQuestion(question, 0), null);
});

test("a followup-looking line inside fenced source remains source", () => {
  const [question] = read(
    markdown +
      "\n```text\n> [!followup]- Literal example\n> Keep this text\n```",
  );
  assert.equal(question.followupAnswers?.length, 1);
  assert(question.answer.includes("> [!followup]- Literal example"));
});

test("new interviews offer only answered stages without mutating the current bank or a legacy snapshot", () => {
  const [question] = read();
  const before = structuredClone(question);
  const session = createSession([question]);
  assert.deepEqual(session.snapshots[question.id].followups, [
    "Чем отличается прокси?",
  ]);
  assert.deepEqual(question, before);
  const old = {
    ...question,
    answer: "Исторический ответ",
    followupAnswers: [],
  };
  const oldBefore = structuredClone(old);
  assert(
    followupQuestion(old, 1, question)?.answer.includes("Прокси — отдельный"),
  );
  assert.deepEqual(old, oldBefore);
  assert.equal(
    followupQuestion(old, 1, { ...question, id: "other" })?.availableAnswer,
    false,
  );
});

test("explicit theory followup selection preserves limits and can reopen a previous choice", () => {
  const [question] = read();
  const session = createSession(
    [{ ...question, followupAnswers: undefined }],
    "daily",
  );
  const opened = openFollowup(session, 1);
  assert.equal(opened.followupIndex, 2);
  assert.equal(openFollowup(opened, 0), opened);
  assert.equal(openFollowup(session, 99), session);
  assert.equal(openFollowup(previousQuestion(opened), 1).followupIndex, 2);
});
