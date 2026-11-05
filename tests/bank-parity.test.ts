import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const markdown = readFileSync(
  new URL(
    "../content/common/Собеседования/Практика/Алгоритмы и данные.md",
    import.meta.url,
  ),
  "utf8",
)
  .replace(/\r\n/g, "\n")
  .replace(/^> ?/gm, "");
const source = [...markdown.matchAll(/```js\n([\s\S]*?)```/g)].find((m) =>
  m[1].includes("checked-example: even-cut"),
)![1];
const count = runInNewContext(source + "\ncountEvenCuts") as (
  values: number[],
) => number;
test("one-cut parity agrees with an independent BigInt split enumeration, including large safe integers", () => {
  for (const values of [
    [],
    [4],
    [0, 0],
    [-1, 3],
    [2, 3, 1],
    [2, 3, 2],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 2],
  ]) {
    let expected = 0;
    for (let i = 1; i < values.length; i++) {
      const sum = (xs: number[]) => xs.reduce((s, n) => s + BigInt(n), 0n);
      if ((sum(values.slice(0, i)) - sum(values.slice(i))) % 2n === 0n)
        expected++;
    }
    assert.equal(count(values), expected);
  }
  assert.throws(() => count([1.5, 2]), /safe integers/);
});
