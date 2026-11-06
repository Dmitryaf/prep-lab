import test from "node:test";
import assert from "node:assert/strict";
import { headingId, renderMarkdown } from "#domain/knowledge/rendering.ts";
import { cleanEditorialNotes } from "#domain/knowledge/editorial-notes.ts";

test("legacy notes hide source metadata and retired-case editorial notices", () => {
  const html = renderMarkdown(`### Таблица
**Тип источника:** предоставленная выгрузка
**Источник задания:** Учебная адаптация «Таблица», файл.pdf, страница 3.
**Допуск к интервью:** нет
**Формат раунда:** Проектирование

Учебная адаптация публичного задания; использование компанией не подтверждено.
Учебный кейс: источник конкретного интервью-задания не подтверждён. Сохранён для чтения и прежней истории; в новые интервью не включается.

Покажи 100 000 строк, сохрани сортировку и фокус.`);
  assert.doesNotMatch(
    html,
    /Тип источника|Источник задания|Допуск к интервью|Формат раунда|Учебная адаптация|Учебный кейс|Сохранён для чтения/,
  );
  assert.match(html, /100 000 строк, сохрани сортировку и фокус/);
});

test("mixed paragraphs retain technical contracts, failure semantics and examples", () => {
  const html =
    renderMarkdown(`Клиент хранит начальные флаги, предоставляет \`start\` и \`stop\`. Исходное задание просит реализацию; следующий код создан платформой специально для ревью по этому контракту. Использование такого кода на реальном интервью не подтверждено.

Источник событий восстанавливается после ошибки; подтверждённый результат сохраняется.
Адрес дан исходным условием, его доступность не подтверждена.
Следующий ошибочный код создан платформой для ревью, а не скопирован как реальный код интервьюера. Компания не подтверждала применение этого примера.
Тело запроса — JSON-массив, новые события сохраняются при отказе сети.`);
  assert.doesNotMatch(
    html,
    /создан платформой|реальном интервью|Компания не подтверждала/,
  );
  assert.match(
    html,
    /начальные флаги, предоставляет <code>start<\/code> и <code>stop<\/code>/,
  );
  assert.match(html, /Источник событий восстанавливается после ошибки/);
  assert.match(html, /его доступность не подтверждена/);
  assert.match(html, /JSON-массив, новые события сохраняются при отказе сети/);
});

test("quoted historical metadata is hidden while literal code remains intact", () => {
  const html = renderMarkdown(`> [!answer]- Ответ
> **Тип источника:** публичная задача
> **Источник задания:** [Источник](https://example.test)
>
> Сохрани очередь событий.
>
> ~~~text
> **Тип источника:** публичная задача
> Учебная адаптация публичного задания; использование компанией не подтверждено.
> ~~~

\`**Источник задания:** sample\`

\`\`\`\`text
\`\`\`
**Источник задания:** literal
Учебный кейс: источник конкретного интервью-задания не подтверждён.
\`\`\`\`
`);
  assert.doesNotMatch(html, /href="https:\/\/example.test"/);
  assert.equal((html.match(/Тип источника/g) ?? []).length, 1);
  assert.match(html, /Сохрани очередь событий/);
  assert.match(html, /Учебная адаптация публичного задания/);
  assert.match(html, /<code>\*\*Источник задания:\*\* sample<\/code>/);
  assert.match(html, /Источник задания:\*\* literal/);
  assert.match(html, /Учебный кейс: источник конкретного интервью-задания/);
});

test("cleanup preserves literal code and line endings, including quoted fence markers", () => {
  const code = [
    "```text",
    "> ```",
    "**Источник задания:** literal",
    "Учебная адаптация публичного задания; использование компанией не подтверждено.",
    "```",
    "`Учебная адаптация публичного задания; использование компанией не подтверждено.`",
    "``Учебный кейс: источник конкретного интервью-задания не подтверждён.``",
  ].join("\r\n");
  assert.equal(cleanEditorialNotes(code), code);
  const input = code + "\r\n**Источник задания:** старое значение";
  assert.equal(cleanEditorialNotes(input), code + "\r\n");
  assert.equal(
    cleanEditorialNotes(cleanEditorialNotes(input)),
    cleanEditorialNotes(input),
  );
});

test("known bank notices disappear without deleting the subsequent problem statement", () => {
  const notes = [
    "Документ из банка помечен AVITO; его подлинность и актуальность не подтверждены компанией. Основной сценарий взят из задания, подробный разбор, проверки и дополнительные условия ниже разработаны для этой платформы.",
    "Источник помечен AVITO; подлинность и актуальность не подтверждены компанией. Условие ниже сохранено по смыслу; решение и правила для конкурирующих загрузок разработаны платформой.",
    "Источник помечен AVITO; подтверждения подлинности или актуальности компанией нет. Контракт цепочки взят из задания; объяснение, проверки и поддержка области поиска ниже самостоятельные.",
    "Файл находится в разделе AVITO предоставленного банка; компания не подтверждала его подлинность или актуальность. Правило участия и примеры взяты из условия; реализация и договорённости о граничных случаях ниже самостоятельные.",
    "Контракты взяты из предоставленного банка. Ошибочный код для ревью, уточнения и исправленные решения созданы этой платформой: они не выдаются за оригинальный код интервьюера. Маркировка AVITO в выгрузке не подтверждает её подлинность или актуальность компанией.",
  ];
  for (const note of notes) {
    const input = note + " Сохрани все максимумы, порядок и входные данные.";
    assert.equal(
      cleanEditorialNotes(input),
      "Сохрани все максимумы, порядок и входные данные.",
    );
  }
});

test("exact attribution sections hide nested content until the next peer or parent heading", () => {
  const html = renderMarkdown(`## Задача
Сохрани контракт.
### Источники
Старая ссылка https://private.example.test
#### Подробности
Редакторская история.
\`\`\`text
## Это текст кода, а не конец раздела
\`\`\`
### Решение
Верни все максимумы.
#### Источники событий
Подпишись на события.
## Происхождение
Закрытая атрибуция.
## Ответ
Очередь сохраняется.
Источник доступности сверён 2026-09-24.`);
  assert.doesNotMatch(
    html,
    /private\.example|Редакторская история|Это текст кода|Закрытая атрибуция|Источник доступности сверён/,
  );
  assert.match(html, /Сохрани контракт/);
  assert.match(html, /Верни все максимумы/);
  assert.match(html, /Источники событий/);
  assert.match(html, /Подпишись на события/);
  assert.match(html, /Очередь сохраняется/);
});

test("attribution headings inside code stay literal and quoted sections have local boundaries", () => {
  const code = "```text\n## Источники\n// https://example.test/source\n```";
  assert.equal(cleanEditorialNotes(code), code);
  for (const title of [
    "Источник",
    "Источники",
    "Происхождение",
    "Атрибуция",
    "Старые источники",
  ]) {
    const html = renderMarkdown(`> [!answer]- Ответ
> ### ${title}
> Скрытая атрибуция.
> #### История
> Скрытые подробности.
> ### Решение
> Сохрани результат.

## Технический раздел
Источник истины — сервер.`);
    assert.doesNotMatch(html, /Скрытая атрибуция|Скрытые подробности/);
    assert.match(html, /Сохрани результат/);
    assert.match(html, /Источник истины — сервер/);
  }
});

test("legacy map heading displays its current title while preserving the old anchor", () => {
  const oldTitle = "Вакансии и происхождение задач";
  const html = renderMarkdown(
    `## ${oldTitle}\nПрактикумы доступны.\n## Подписки и синхронные источники\nПодпишись.\n## Как избежать двух источников истины?\nВыбери владельца.`,
  );
  assert.match(html, /Вакансии и практикумы/);
  assert(html.includes(`id="${headingId(oldTitle)}"`));
  assert.doesNotMatch(html, />Вакансии и происхождение задач</);
  assert.match(html, /Подписки и синхронные источники/);
  assert.match(html, /Как избежать двух источников истины/);
});
