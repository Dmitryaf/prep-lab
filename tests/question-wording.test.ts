import test from "node:test";
import assert from "node:assert/strict";
import { compileKnowledge } from "#domain/knowledge/catalog.ts";
import { renderMarkdown, headingId } from "#domain/knowledge/rendering.ts";
import { resolveKnowledgeLink } from "#domain/knowledge/links.ts";

test("rewritten headings preserve question identity, routes and old links without displaying metadata", () => {
  const path = "Собеседования/Темы/Диагностика.md";
  const old = "Как расследовать инцидент?";
  const title = "После обновления не сохраняется форма. Как найти причину?";
  const note = {
    id: path.slice(0, -3),
    path,
    title: "Диагностика",
    category: "Инженерные вопросы",
    markdown: `# Диагностика\n\n## ${title}\n\n**ID вопроса:** ${old}\n\n> [!answer]- Ответ\n> Проверить запрос сохранения.\n`,
  };
  const route = {
    ...note,
    id: "Собеседования/01. Основной маршрут",
    path: "Собеседования/01. Основной маршрут.md",
    markdown: `1. [[${note.id}#${old}|${title}]]`,
  };
  const bank = compileKnowledge([note, route]);
  const q = bank.questions[0]!;
  assert.equal(q.id, `ck:${note.id}#${old}`);
  assert.equal(q.heading, title);
  assert.equal(q.title, title);
  assert.equal(q.prompt, title);
  assert.deepEqual(bank.route, [q.id]);
  assert.deepEqual(bank.warnings, []);
  const html = renderMarkdown(note.markdown);
  assert(!html.includes("ID вопроса"));
  assert(html.includes(`id="${headingId(old)}"`));
  assert(html.includes(`id="${headingId(title)}"`));
  assert.equal(
    resolveKnowledgeLink(
      `${note.id}#${old}`,
      note.id,
      () => note,
      (_id, h) => h,
    ),
    old,
  );
});

test("an ID-looking line inside a code sample is neither metadata nor an anchor", () => {
  const note = {
    id: "Собеседования/Темы/Example",
    path: "Собеседования/Темы/Example.md",
    markdown:
      "## Текущий вопрос?\n\n```md\n**ID вопроса:** Другой вопрос?\n```\n\n> [!answer]- Ответ\n> Ответ\n",
  };
  const bank = compileKnowledge([
    { ...note, title: "Example", category: "JavaScript" },
  ]);
  assert.equal(bank.questions[0]!.id, `ck:${note.id}#Текущий вопрос?`);
  assert(
    !renderMarkdown(note.markdown).includes(
      `id="${headingId("Другой вопрос?")}"`,
    ),
  );
});
