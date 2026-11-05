import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadCommonKnowledge } from "../server/infrastructure/knowledge/common.ts";

const common = loadCommonKnowledge();
function run(title: string, marker: string, scenario: string) {
  const question = common.questions.find((entry) => entry.title === title);
  assert(question?.availableAnswer, `Missing worked solution: ${title}`);
  assert(question.criteria && question.learningLinks.length);
  assert.equal(question.followups.length, 2);
  assert.equal(question.roundFormat, "coding");
  const block = [...question.answer.matchAll(/```js\n([\s\S]*?)```/g)].find(
    (match) => match[1].includes(`// checked-example: ${marker}`),
  );
  assert(block, `Missing executable example: ${marker}`);
  return vm.runInNewContext(
    `${block[1]}\n(() => { ${scenario} })()`,
    {},
    { timeout: 3000 },
  );
}
const nearest = (scenario: string) =>
  run("Суммарная неудовлетворённость покупателей", "nearest-product", scenario);
const windowMin = (scenario: string) =>
  run("Минимум в окне потоковых данных", "window-min", scenario);

test("nearest reusable product preserves arrays, duplicates and negative values", () => {
  assert.equal(
    nearest(`
    const goods = Object.freeze([8, 3, 5]);
    const buyers = Object.freeze([5, 6]);
    return JSON.stringify([
      totalDissatisfaction(goods, buyers),
      totalDissatisfaction([5], [3, 5, 10, 105]),
      totalDissatisfaction([25, 10, 20], [10, 10, 20]),
      totalDissatisfaction([-10, -4, -4], [-20, -7, 0]),
      totalDissatisfaction([], []),
      totalDissatisfaction([2], []), goods, buyers
    ]);
  `),
    "[1,107,0,17,0,0,[8,3,5],[5,6]]",
  );
});

test("nearest product matches brute force across order, boundaries and ties", () => {
  assert.equal(
    nearest(`
    for (let seed = 1; seed <= 150; seed++) {
      const goods = Array.from({length: seed % 13 + 1}, (_, i) => (seed * 17 + i * 11) % 37 - 18);
      const needs = Array.from({length: seed % 17}, (_, i) => (seed * 23 + i * 7) % 61 - 30);
      const expected = needs.reduce((sum, need) => sum + Math.min(...goods.map(g => Math.abs(g - need))), 0);
      if (totalDissatisfaction(goods, needs) !== expected) return false;
    }
    return true;
  `),
    true,
  );
});

test("nearest product rejects empty catalogue for buyers and invalid numbers", () => {
  assert.throws(
    () => nearest("return totalDissatisfaction([], [1]);"),
    /Empty catalogue/,
  );
  for (const input of [
    "[NaN]",
    "[Infinity]",
    "[1.5]",
    "['2']",
    "[1000000001]",
    "Array(1)",
  ]) {
    assert.throws(
      () => nearest(`return totalDissatisfaction(${input}, [1]);`),
      /integer/,
    );
    assert.throws(
      () => nearest(`return totalDissatisfaction([1], ${input});`),
      /integer/,
    );
  }
});

test("stream minimum defines empty and warmup states, expires by position not distinct count", () => {
  assert.equal(
    windowMin(`
    const window = new SlidingWindowMin(3);
    const minima = [window.getMin()];
    for (const value of [2, 4, 4, 6, 2, 7, 4, 1, 10, 8]) {
      window.add(value); minima.push(window.getMin());
    }
    const single = new SlidingWindowMin(1);
    single.add(-3); const a = single.getMin(); single.add(9);
    return JSON.stringify([minima, a, single.getMin()]);
  `),
    "[[null,2,2,2,4,2,2,2,1,1,1],-3,9]",
  );
});

test("stream minimum matches a simple window over long increasing, decreasing and mixed streams", () => {
  assert.equal(
    windowMin(`
    for (const width of [1, 2, 17, 100]) {
      for (const values of [
        Array.from({length: 2000}, (_, i) => i),
        Array.from({length: 2000}, (_, i) => -i),
        Array.from({length: 2000}, (_, i) => (i * 31) % 29 - 14)
      ]) {
        const window = new SlidingWindowMin(width), oracle = [];
        for (const value of values) {
          window.add(value); oracle.push(value);
          if (oracle.length > width) oracle.shift();
          if (window.getMin() !== Math.min(...oracle)) return false;
          if (window.getMin() !== Math.min(...oracle)) return false;
        }
      }
    }
    return true;
  `),
    true,
  );
});

test("invalid window size and values fail without consuming a position", () => {
  for (const width of ["0", "-1", "1.2", "NaN", "Infinity"]) {
    assert.throws(
      () => windowMin(`return new SlidingWindowMin(${width});`),
      /width/,
    );
  }
  assert.equal(
    windowMin(`
    const window = new SlidingWindowMin(2);
    window.add(-5);
    for (const value of [NaN, Infinity, '2']) {
      let failed = false;
      try { window.add(value); } catch { failed = true; }
      if (!failed) return false;
    }
    window.add(3);
    return window.getMin() === -5;
  `),
    true,
  );
});
