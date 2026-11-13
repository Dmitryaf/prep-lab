import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "#domain/knowledge/rendering.ts";
import { resolveKnowledgeLink } from "#domain/knowledge/links.ts";

test("metadata rendering preserves headings and links without tokenizing code, including callouts", () => {
  const markdown =
    '# Раздел\n\n```js\nconst value = "<script>";\n```\n\n> [!note]\n> ## Вложенный раздел\n> ```ts\n> const value: number = 1;\n> ```\n> [[Связанный#Якорь|Переход]]\n\n`[[не ссылка]]`';
  const links: string[] = [];
  const html = renderMarkdown(markdown, {
    highlight: false,
    resolveLink(target) {
      links.push(target);
      return "#resolved";
    },
  });
  assert(!html.includes('class="hljs-'), "metadata must not highlight code");
  assert(html.includes("&lt;script&gt;"));
  assert.deepEqual(links, ["Связанный#Якорь"]);
  const ids = (value: string) =>
    [...value.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids(html), ids(renderMarkdown(markdown)));
  assert(renderMarkdown(markdown).includes('class="hljs-'));
});

test("heading checks observe edited and replaced notes and do not retain old anchors", () => {
  let note = {
    id: "lesson",
    markdown: "# Старый\n\n> [!note]\n> ## Вложенный",
  };
  const link = (heading: string) =>
    resolveKnowledgeLink(
      `lesson#${heading}`,
      "lesson",
      () => note,
      (id, anchor) => `${id}#${anchor}`,
    );
  assert.equal(link("Старый"), "lesson#Старый");
  assert.equal(link("Старый"), "lesson#Старый");
  note.markdown = "# Новый";
  assert.equal(link("Старый"), null);
  assert.equal(link("Новый"), "lesson#Новый");
  note = { id: "lesson", markdown: "# Другой" };
  assert.equal(link("Новый"), null);
  assert.equal(link("Другой"), "lesson#Другой");
});
