import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allowedKnowledgePath,
  extractQuestions,
  loadKnowledge,
} from "#server/knowledge.ts";
import {
  renderMarkdown,
  headingId,
} from "#ui/entities/material/lib/markdown.ts";

test("allowlist excludes private and service documents, traversal and executable labs", () => {
  for (const path of [
    "Фронтенд/Vue/01. Тема.md",
    "Собеседования/Практика/Vue.md",
  ])
    assert(allowedKnowledgePath(path));
  for (const path of [
    "Резюме/Резюме.md",
    "Поиск работы/00.md",
    "Собеседования/Текущая подготовка.md",
    "HR и самопрезентация/05. Зарплатные ожидания.md",
    "Фронтенд/_archive/a.md",
    "Фронтенд/AGENTS.md",
    "Фронтенд/labs/README.md",
    "Фронтенд/../../secret.md",
    "Фронтенд\\secret.md",
  ])
    assert(!allowedKnowledgePath(path), path);
});

test("owner-only folders are excluded from the common folder allowlist", () => {
  for (const name of ["Материал", "Личный ответ", "Архив"])
    assert(!allowedKnowledgePath(`Личные материалы/${name}.md`));
});

test("theory extracts questions with answers, not toc or headings inside code; retains parent and followups", () => {
  const note = {
    id: "Собеседования/Темы/Vue",
    path: "Собеседования/Темы/Vue.md",
    markdown:
      "# Vue\n> [!abstract]- Оглавление\n> [[x#Вопрос]]\n\n## Вопрос\n> [!answer]- Ответ\n> Объяснение.\n\n**Уточнения**\n- Почему?\n\n### Деталь\n> [!answer]- Ответ\n> ```js\n> ## не заголовок\n> ```\n\n## Группа\n### Ещё вопрос\n> [!answer]- Ответ\n> Да.",
  };
  const qs = extractQuestions(note);
  assert.deepEqual(
    qs.map((q) => q.title),
    ["Вопрос", "Деталь", "Ещё вопрос"],
  );
  assert.equal(qs[1].parentId, qs[0].id);
  assert.deepEqual(qs[0].followups, ["Почему?", "Деталь"]);
  assert(!qs[0].prompt.includes("Объяснение"));
  assert.equal(qs[0].shortAnswer, "Объяснение.");
  assert(qs[0].answer.includes("Почему?"));
});
test("practical grouping and design condition subsections become complete tasks, not stray cards", () => {
  const practice = extractQuestions({
    id: "p",
    path: "Собеседования/Практика/JavaScript.md",
    markdown:
      "# Задачи\n## Асинхронность\n### Очередь\nНапишите функцию, которая выполняет переданные операции по очереди.\n> [!question]- Разбор\n> Решение\n> ```js\n> const x = 1;\n> ```",
  });
  assert.equal(practice.length, 1);
  assert.equal(practice[0].title, "Очередь");
  assert.equal(practice[0].kind, "practice");
  assert(!practice[0].prompt.includes("Решение"));
  assert(practice[0].answer.includes("const x"));
  const design = extractQuestions({
    id: "d",
    path: "Собеседования/Проектирование/Системы и API.md",
    markdown:
      "# Задачи\n## Требования и ограничения\nОбщие рекомендации, которые сами не являются заданием.\n## Отчёт\n### Условие\nСпроектируйте отчёт по данным партнёра в нескольких валютах.\n### Дополнительные условия\nИсторический курс недоступен; поясните свои допущения.",
  });
  assert.equal(design.length, 1);
  assert.equal(design[0].title, "Отчёт");
  assert(design[0].prompt.includes("Исторический курс"));
  assert.equal(design[0].availableAnswer, false);
});
test("Markdown escapes HTML, dangerous URLs and code, renders tables and closed nested answers", () => {
  const html = renderMarkdown(
    "---\ntitle: Secret metadata\n---\n# Тема\n<script>alert(1)</script>\n[x](javascript:alert)\n\n> [!answer]- Ответ\n> **Объяснение**\n>\n> > [!example]- Детали\n> > текст\n\n| Имя | Связь |\n| --- | --- |\n| A | [[path#Раздел\\|Ссылка]] |\n\n```html\n<img onerror=alert(1)>\n```",
    { resolveLink: () => "#note=path" },
  );
  assert(!html.includes("<script>"));
  assert(!html.includes('href="javascript:'));
  assert(!html.includes("Secret metadata"));
  assert(html.includes("<table>"));
  assert(html.includes('href="#note=path">Ссылка</a>'));
  assert.equal((html.match(/<details/g) || []).length, 2);
  assert(!html.includes(" open"));
  assert(
    html
      .replace(/<\/?span\b[^>]*>/g, "")
      .includes("&lt;img onerror=alert(1)&gt;"),
  );
  assert(html.includes(`id="${headingId("Тема")}"`));
});
test("read-only inventory resolves the route and does not follow symlinks outside the vault", (t) => {
  const root = mkdtempSync(join(tmpdir(), "knowledge-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "Собеседования/Темы"), { recursive: true });
  writeFileSync(
    join(root, "Собеседования/Темы/Vue.md"),
    "# Vue\n## Вопрос\n> [!answer]- Ответ\n> Текст",
  );
  writeFileSync(
    join(root, "Собеседования/01. Основной маршрут.md"),
    "1. [[Собеседования/Темы/Vue#Вопрос|Вопрос]]",
  );
  const outside = mkdtempSync(join(tmpdir(), "knowledge-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "secret.md"), "# SECRET");
  symlinkSync(outside, join(root, "Фронтенд"), "junction");
  const data = loadKnowledge(root);
  assert.equal(data.questions.length, 1);
  assert.deepEqual(data.route, [data.questions[0].id]);
  assert(!JSON.stringify(data).includes("SECRET"));
  assert.throws(() => loadKnowledge(join(root, "missing")));
});
test("ancestor junction cannot expose a private subtree under an allowed folder name", (t) => {
  const root = mkdtempSync(join(tmpdir(), "knowledge-ancestor-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "private/Темы"), { recursive: true });
  writeFileSync(
    join(root, "private/Темы/Vue.md"),
    "# SECRET\n## Question\n> [!answer]- Answer\n> PRIVATE CONTENT",
  );
  symlinkSync(join(root, "private"), join(root, "Собеседования"), "junction");
  assert.equal(loadKnowledge(root).notes.length, 0);
});
test("Markdown resolves space-containing paths and qualified section anchors", () => {
  const targets: string[] = [];
  const html = renderMarkdown(
    "# Документ\n## Часть\n### Раздел\n[Заметка](<../Папка с пробелами/Тема.md#Раздел>)\n[Раздел](#Часть#Раздел)",
    {
      resolveLink: (target) => {
        targets.push(target);
        return target.startsWith("#")
          ? "#" + headingId(target.slice(1))
          : "#note=example";
      },
    },
  );
  assert.deepEqual(targets, [
    "../Папка с пробелами/Тема.md#Раздел",
    "#Часть#Раздел",
  ]);
  assert(html.includes(`id="${headingId("Часть#Раздел")}"`));
  assert(html.includes(`href="#${headingId("Часть#Раздел")}"`));
});

test("study metadata is separate from the answer and validates only indexed targets", (t) => {
  const root = mkdtempSync(join(tmpdir(), "knowledge-study-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "Собеседования/Темы"), { recursive: true });
  mkdirSync(join(root, "Фронтенд/JavaScript"), { recursive: true });
  writeFileSync(
    join(root, "Фронтенд/JavaScript/TDZ.md"),
    "# TDZ\n## Пример\nОбъяснение",
  );
  writeFileSync(
    join(root, "Собеседования/Темы/JavaScript.md"),
    "# JS\n## Hoisting и TDZ\n> [!answer]- Ответ\n> TDZ заканчивается при инициализации.\n\n**Уточнения**\n- Почему ошибка?\n\n**Критерии ответа:** Объясняю затенение.\n\n**Изучить:** [[Фронтенд/JavaScript/TDZ#Пример|Теория]]\n\n**Практика:** [[Резюме/Секрет|Скрыто]]\n\n### Деталь\n> [!answer]- Ответ\n> Дочерний ответ.",
  );
  writeFileSync(
    join(root, "Собеседования/01. Основной маршрут.md"),
    "1. [[Собеседования/Темы/JavaScript#Hoisting и TDZ]]",
  );
  const data = loadKnowledge(root),
    q = data.questions[0];
  assert.equal(q.curriculumTier, "core");
  assert.equal(data.questions[1].curriculumTier, "extended");
  assert.equal(q.learningLinks.length, 1);
  assert.equal(q.learningLinks[0].heading, "Пример");
  assert.equal(q.criteria, "Объясняю затенение.");
  assert(!q.answer.includes("Критерии ответа"));
  assert(!q.answer.includes("Скрыто"));
  assert.equal(data.warnings.length, 1);
  assert.equal(q.followups[0], "Почему ошибка?");
});
