import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";

const bank = loadCommonKnowledge();
function codeFor(title: string) {
  const answer = bank.questions
    .flatMap((q) => q.followupAnswers || [])
    .find((a) => a.title === title)?.answer;
  const code = answer?.match(/~~~js\n([\s\S]*?)\n~~~/)?.[1];
  assert(code, `Missing executable example: ${title}`);
  return code;
}

const languageExamples: [string, unknown[]][] = [
  [
    "Что произойдёт после присваивания объекта второй переменной и изменения его свойства?",
    [2, 2],
  ],
  [
    "Почему Object.freeze не защищает вложенные объекты от изменения?",
    ["Ольга", "TypeError"],
  ],
  [
    "Почему [] == false возвращает true, хотя пустой массив truthy?",
    [true, true, false],
  ],
  [
    "Почему let в заголовке for даёт отдельную привязку каждой итерации, а var — общую?",
    ["0,1,2", "3,3,3"],
  ],
  [
    "Что изменится, если после создания callback заменить user.save?",
    ["old", "new"],
  ],
  [
    "Как ведёт себя связанная через bind функция при вызове с new?",
    ["Анна", undefined, true],
  ],
  [
    "Как обновить вложенное поле без глубокой копии всего дерева?",
    ["Анна", false, true],
  ],
];

for (const [title, expected] of languageExamples) {
  test(`published JavaScript example: ${title}`, () => {
    const log: unknown[] = [];
    runInNewContext(
      codeFor(title),
      {
        console: { log: (value: unknown) => log.push(value) },
      },
      { timeout: 1000 },
    );
    assert.deepEqual(log, expected);
  });
}

test("the published Promise example distinguishes the synchronous executor from then", async () => {
  const log: string[] = [];
  await runInNewContext(
    codeFor("Когда выполняется executor new Promise, а когда callback then?") +
      "\nready",
    {
      console: { log: (value: string) => log.push(value) },
    },
    { timeout: 1000 },
  );
  assert.deepEqual(log, ["A", "B", "C", "D"]);
});

test("the published generation example ignores stale success, failure, finally and disposed work", async () => {
  const pending = new Map<
    string,
    { resolve: (value: number) => void; reject: (error: Error) => void }
  >();
  const events: unknown[] = [];
  const api = runInNewContext(
    codeFor("Как проверить актуальность результата без поддержки отмены?") +
      "\n({load, dispose})",
    {
      read: (id: string) =>
        new Promise<number>((resolve, reject) =>
          pending.set(id, { resolve, reject }),
        ),
      showLoading: (value: boolean) => events.push(["loading", value]),
      showData: (value: number) => events.push(["data", value]),
      showError: (value: Error) => events.push(["error", value.message]),
    },
    { timeout: 1000 },
  ) as { load: (id: string) => Promise<void>; dispose: () => void };

  const a = api.load("A"),
    b = api.load("B");
  pending.get("B")!.resolve(20);
  await b;
  pending.get("A")!.reject(new Error("late failure"));
  await a;
  assert.deepEqual(events, [
    ["loading", true],
    ["loading", true],
    ["data", 20],
    ["loading", false],
  ]);

  events.length = 0;
  const c = api.load("C"),
    d = api.load("D");
  pending.get("C")!.resolve(30);
  await c;
  assert.deepEqual(events, [
    ["loading", true],
    ["loading", true],
  ]);
  pending.get("D")!.reject(new Error("current failure"));
  await d;
  assert.deepEqual(events.slice(2), [
    ["error", "current failure"],
    ["loading", false],
  ]);

  events.length = 0;
  const e = api.load("E");
  api.dispose();
  pending.get("E")!.resolve(50);
  await e;
  assert.deepEqual(events, [["loading", true]]);
});
