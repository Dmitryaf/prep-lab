import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "#domain/knowledge/rendering.ts";

test("blank lines between ordered items do not restart a callout list", () => {
  const html = renderMarkdown(`> [!answer]- Разбор ответа
> 1. Первый
> 2. Второй
>
> 3. Третий
>
> 4. Четвёртый`);
  assert.equal((html.match(/<ol\b/g) || []).length, 1);
  assert.match(
    html,
    /<ol><li>Первый<\/li><li>Второй<\/li><li>Третий<\/li><li>Четвёртый<\/li><\/ol>/,
  );
});

test("an explicit starting number is retained, while prose separates independent lists", () => {
  const html = renderMarkdown(
    "3. Третий\n\n4. Четвёртый\n\nНовый список:\n\n1. Заново\n\n2. Дальше",
  );
  assert.equal(
    html,
    '<ol start="3"><li>Третий</li><li>Четвёртый</li></ol><p>Новый список:</p><ol><li>Заново</li><li>Дальше</li></ol>',
  );
});

test("unordered loose items stay together without swallowing another block or code", () => {
  assert.equal(
    renderMarkdown("- Один\n\n- Два\n\n## Заголовок\n\n1. Номер"),
    '<ul><li>Один</li><li>Два</li></ul><h2 id="h-%D0%97%D0%B0%D0%B3%D0%BE%D0%BB%D0%BE%D0%B2%D0%BE%D0%BA">Заголовок</h2><ol><li>Номер</li></ol>',
  );
  const html = renderMarkdown(
    "1. Один\n\n```text\n2. Это код\n```\n\n3. Продолжение",
  );
  assert.match(html, /<pre\b[^>]*><code>2\. Это код<\/code><\/pre>/);
  assert.match(html, /<ol start="3"><li>Продолжение<\/li><\/ol>$/);
});
