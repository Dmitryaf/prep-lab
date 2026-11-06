import test from "node:test";
import assert from "node:assert/strict";
import { cleanEditorialNotes } from "#domain/knowledge/editorial-notes.ts";
import { renderMarkdown } from "#domain/knowledge/rendering.ts";

const notices = [
  "Готовая реализация помогает проверить механизм; успешный запуск сам по себе не подтверждает самостоятельное решение.",
  "Готовые исходники — образец для сверки после попытки; зелёный тест без собственной реализации не подтверждает освоение.",
  "Прочитанная заметка и успешно запущенный готовый тест не доказывают самостоятельное владение темой.",
  "Подготовленный материал и выполненный готовый тест не равны самостоятельно подтверждённому умению.",
  "Успех готового теста также не подтверждает самостоятельное освоение темы.",
  "Подготовленные материалы не подтверждают освоение.",
  "Один выученный ответ не подтверждает готовность.",
  "Прохождение этой страницы не подтверждает освоение: повтори задачи без раскрытого решения.",
  "При подсказке фиксируется её влияние; написанный здесь ответ не является свидетельством твоего освоения.",
  "DOM-проверка готового примера не заменяет собственный тест.",
  "Прочитанный материал или пройденный курс сам по себе не доказывает умение.",
  "Это подтверждает сценарии стенда, но не самостоятельное владение темой или реальную сеть.",
  "Отделите собственную работу от решений библиотек и помощи других участников.",
  "Исходный код сам по себе не подтверждает личное авторство.",
  "Личная роль не подтверждена.",
  "Личный разбор по переданным данным. Код не подтверждает авторство; сведения о роли требуют рассказа пользователя.",
  "Чтение фрагментов не подтверждает запуск, авторство и коммерческие результаты.",
];

test("legacy learning notices disappear from rendered prose while the exercise remains", () => {
  const original = `## Практикум\n${notices.join("\n")}\nПоменяй порядок ответов A и B.\n\n\`npm test\``;
  const snapshot = { answer: original };
  const before = JSON.stringify(snapshot);
  const html = renderMarkdown(snapshot.answer);
  for (const notice of notices) assert(!html.includes(notice), notice);
  assert.doesNotMatch(
    html,
    /не подтверждает освоение|свидетельством твоего|самостоятельное владение|самостоятельного владения/,
  );
  assert.match(html, /Поменяй порядок ответов A и B/);
  assert.match(html, /<code>npm test<\/code>/);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(
    cleanEditorialNotes(cleanEditorialNotes(original)),
    cleanEditorialNotes(original),
  );
});

test("cleanup preserves learning notices when quoted as fenced or inline code", () => {
  const code = [
    "```text",
    ...notices,
    "```",
    "> ~~~~text",
    ...notices.map((line) => "> " + line),
    "> ~~~~",
    ...notices.map((line) => "`" + line + "`"),
    ...notices.map((line) => "``" + line + "``"),
  ].join("\r\n");
  assert.equal(cleanEditorialNotes(code), code);
  const mixed = `\`${notices[5]}\` ${notices[5]} Проверь отмену.`;
  assert.equal(
    cleanEditorialNotes(mixed),
    `\`${notices[5]}\`  Проверь отмену.`,
  );
});

test("technical limits remain visible beside removed self-assessment wording", () => {
  const technical = [
    "navigator.onLine не означает доступность API.",
    "Promise.race сам по себе не отменяет проигравшую операцию.",
    "Отмена локального Promise не доказывает отмену серверной команды.",
    "Тесты в jsdom не измеряют браузерный layout и производительность.",
    "Приведение as User[] не проверяет JSON сервера.",
  ].join("\n");
  assert.equal(cleanEditorialNotes(technical), technical);
  const html = renderMarkdown(`${technical}\n${notices[4]}`);
  for (const line of technical.split("\n")) assert(html.includes(line), line);
  assert(!html.includes(notices[4]));
});

test("legacy README wording keeps network and browser limits after cleanup", () => {
  const html = renderMarkdown(
    "Тесты в jsdom проверяют состояние и DOM. Они не измеряют браузерный layout, производительность, реальную сеть или качество самостоятельного ответа. Визуальное поведение проверяйте на странице стенда. React Compiler, Next.js и RSC здесь не используются.",
  );
  assert.doesNotMatch(html, /качество самостоятельного ответа/);
  assert.match(html, /Layout и производительность проверяйте в браузере/);
  assert.match(html, /сеть в тестах имитируется/);
  assert.match(html, /React Compiler, Next.js и RSC здесь не используются/);
});

test("legacy architecture notices become concrete instructions without broad deletions", () => {
  const html =
    renderMarkdown(`Учебный пример: story передаёт Select пустой options.
Это пример документации, не подтверждение использования Storybook в собственных проектах.
Постоянно забирать задачу себе быстрее в моменте, но это не подтверждает передачу знания.
Число удалённых строк само по себе не доказывает улучшение.
Скриншот показывает внешний вид, но не доказывает работу фокуса. Тест нового компонента не доказывает совместимость старого экрана.
Моя дополнительная проверка ещё не подтверждена.
Идентификаторы: session-1, request-2.`);
  assert.doesNotMatch(
    html,
    /собственных проектах|не подтверждает передачу|Число удалённых строк/,
  );
  assert.match(html, /Дай коллеге выполнить следующий шаг самому/);
  assert.match(html, /Проверь переходы фокуса с клавиатуры/);
  assert.match(html, /Моя дополнительная проверка ещё не подтверждена/);
  assert.match(html, /Идентификаторы: session-1, request-2/);
});
