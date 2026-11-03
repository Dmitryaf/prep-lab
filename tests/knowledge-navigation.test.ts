import assert from "node:assert/strict";
import test from "node:test";
import {
  renderMarkdown,
  headingId,
} from "../app/entities/material/lib/markdown.ts";

const source = "Собеседования/Темы/JavaScript";
const notes = new Map([
  [source, { id: source, markdown: "# Вопросы\n## Вопрос\nТекст" }],
  [
    "Фронтенд/JavaScript/Тема",
    {
      id: "Фронтенд/JavaScript/Тема",
      markdown:
        "# Тема\n## Пример\n### Деталь\nТекст\n> [!answer]- Ответ\n> ## Скрытый раздел\n> Текст\n\n```md\n## Не раздел\n```",
    },
  ],
  [
    "Собеседования/Темы/Сосед",
    { id: "Собеседования/Темы/Сосед", markdown: "# Сосед" },
  ],
  [
    "Собеседования/Практика/Задача с пробелами",
    {
      id: "Собеседования/Практика/Задача с пробелами",
      markdown: "# Задача\n## Решение\nТекст",
    },
  ],
]);
const hrefFor = (id: string, heading: string) =>
  "#/themes?note=" +
  encodeURIComponent(id) +
  (heading ? "&heading=" + encodeURIComponent(heading) : "");
async function resolver() {
  const { resolveKnowledgeLink } =
    await import("../app/entities/material/lib/links.ts");
  return (raw: string) =>
    resolveKnowledgeLink(raw, source, (id) => notes.get(id), hrefFor);
}

test("explicit resolver denial never falls back to an anchor and explains both link syntaxes", () => {
  const html = renderMarkdown(
    "[Markdown](#Закрытый) [[#Закрытый|Wiki]] [Личная заметка](Резюме/Личное.md)",
    { resolveLink: () => null },
  );
  assert(!html.includes("<a "));
  assert.equal((html.match(/class="unavailable-link"/g) || []).length, 3);
  assert.equal((html.match(/недоступно в учебном каталоге/g) || []).length, 3);
});

test("indexed root, relative, encoded and explicit historical paths retain working transitions", async () => {
  const resolve = await resolver();
  const target = "Фронтенд/JavaScript/Тема";
  assert.equal(resolve(target + ".md"), hrefFor(target, ""));
  assert.equal(resolve("/" + target + ".md"), hrefFor(target, ""));
  assert.equal(resolve("Фронтенд/Javascript/Тема.md"), hrefFor(target, ""));
  assert.equal(resolve("Сосед.md"), hrefFor("Собеседования/Темы/Сосед", ""));
  assert.equal(
    resolve("../Практика/Задача%20с%20пробелами.md#Решение"),
    hrefFor("Собеседования/Практика/Задача с пробелами", "Решение"),
  );
  assert.equal(
    resolve("../../Фронтенд/JavaScript/Тема.md#Пример"),
    hrefFor(target, "Пример"),
  );
  assert.equal(resolve("#Вопрос"), hrefFor(source, "Вопрос"));
});

test("anchors use actual rendered heading IDs including qualified and closed-callout headings", async () => {
  const resolve = await resolver();
  for (const heading of [
    "Пример",
    "Пример#Деталь",
    "Тема#Пример#Деталь",
    "Скрытый раздел",
  ])
    assert.equal(
      resolve("Фронтенд/JavaScript/Тема#" + encodeURIComponent(heading)),
      hrefFor("Фронтенд/JavaScript/Тема", heading),
    );
  assert.equal(resolve("Фронтенд/JavaScript/Тема#Не раздел"), null);
  assert.equal(resolve("Фронтенд/JavaScript/Тема#Отсутствует"), null);
  assert.equal(resolve("#Отсутствует"), null);
  assert(renderMarkdown("## Пример").includes(headingId("Пример")));
});

test("private, absent, malformed and executable targets remain unavailable", async () => {
  const resolve = await resolver();
  for (const target of [
    "HR и самопрезентация/03. Поведенческие ответы.md",
    "Резюме/Личное.md",
    "Собеседования/02. Журнал проверки.md",
    "_meta/Служебное.md",
    "Фронтенд/JavaScript/Нет.md",
    "Фронтенд/javascript/Тема",
    "%E0%A4%A",
    "javascript:alert(1)",
    "javascript%3Aalert(1)",
    "data:text/html,test",
    "file:///secret",
    "//example.com",
    "../../../secret",
  ])
    assert.equal(resolve(target), null, target);
});

test("real resolver keeps external HTTP links and applies the same availability rule in both syntaxes", async () => {
  const resolve = await resolver();
  const html = renderMarkdown(
    "[Внешний](https://example.com/path?q=1) [Раздел](<../../Фронтенд/JavaScript/Тема.md#Пример>) [[Фронтенд/JavaScript/Тема#Пример|Wiki]] [[Резюме/Личное|Личное]]",
    { resolveLink: resolve },
  );
  assert.equal((html.match(/<a /g) || []).length, 3);
  assert(html.includes('target="_blank" rel="noopener noreferrer"'));
  assert(html.includes('class="unavailable-link"'));
  assert(!html.includes("note=" + encodeURIComponent("Резюме/Личное")));
});
