import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadCommonKnowledge } from "../server/infrastructure/knowledge/common.ts";

function solution() {
  const question = loadCommonKnowledge().questions.find(
    (q) =>
      q.id ===
      "ck:Собеседования/Практика/Алгоритмы и данные#Шаговое соревнование",
  );
  assert(question?.availableAnswer, "Missing step competition solution");
  assert(question.criteria && question.learningLinks.length);
  const block = [...question.answer.matchAll(/```js\n([\s\S]*?)```/g)].find(
    (entry) => entry[1].includes("// checked-example: step-champions"),
  );
  assert(block, "Missing checked step competition example");
  return block[1];
}
function champions(statistics: { userId: number | string; steps: number }[][]) {
  return JSON.parse(
    vm.runInNewContext(
      `${solution()}\nconst input = ${JSON.stringify(statistics)};
    input.forEach(day => { day.forEach(Object.freeze); Object.freeze(day); });
    Object.freeze(input);
    JSON.stringify(getChampions(input));`,
      {},
      { timeout: 3000 },
    ),
  );
}

test("step competition excludes participants who missed any day despite larger totals", () => {
  assert.deepEqual(
    champions([
      [
        { userId: 1, steps: 1000 },
        { userId: 2, steps: 1500 },
      ],
      [
        { userId: 2, steps: 1000 },
        { userId: 3, steps: 99999 },
      ],
      [
        { userId: 1, steps: 99999 },
        { userId: 2, steps: 500 },
      ],
    ]),
    { userIds: [2], steps: 3000 },
  );
});

test("step competition returns all ties in first-day order without mutating records", () => {
  assert.deepEqual(
    champions([
      [
        { userId: 1, steps: 2000 },
        { userId: 2, steps: 1500 },
      ],
      [
        { userId: 2, steps: 4000 },
        { userId: 1, steps: 3500 },
      ],
    ]),
    { userIds: [1, 2], steps: 5500 },
  );
  assert.deepEqual(
    champions([
      [
        { userId: "0", steps: 0 },
        { userId: 0, steps: 0 },
      ],
    ]),
    {
      userIds: ["0", 0],
      steps: 0,
    },
  );
});

test("step competition defines no winner for no days, an empty day or disjoint attendance", () => {
  for (const input of [
    [],
    [[]],
    [[{ userId: 1, steps: 5 }], []],
    [[], [{ userId: 1, steps: 5 }]],
    [[{ userId: 1, steps: 5 }], [{ userId: 2, steps: 5 }]],
  ]) {
    assert.deepEqual(champions(input), { userIds: [], steps: 0 });
  }
});

test("step competition ignores later newcomers and keeps the qualifying zero-step participant", () => {
  const newcomers = Array.from({ length: 10_000 }, (_, userId) => ({
    userId: userId + 1,
    steps: 100,
  }));
  assert.deepEqual(
    champions([
      [{ userId: 0, steps: 0 }],
      [...newcomers, { userId: 0, steps: 0 }],
    ]),
    {
      userIds: [0],
      steps: 0,
    },
  );
});
