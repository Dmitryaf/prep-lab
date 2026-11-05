import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const text = readFileSync(
  new URL(
    "../content/common/Собеседования/Практика/Ревью параллельных запросов.md",
    import.meta.url,
  ),
  "utf8",
).replace(/^> ?/gm, "");
const source = [...text.matchAll(/```js\n([\s\S]*?)```/g)].find((m) =>
  m[1].includes("checked-example: review-map-limit"),
)![1];
const mapLimit = runInNewContext(source + "\nmapLimit") as (
  ids: number[],
  limit: number,
  get: (id: number) => Promise<number>,
) => Promise<number[]>;
const deferred = () => {
  let resolve!: (value: number) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<number>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
};
test(
  "review pool refills a free slot before a slow peer and preserves input order",
  { timeout: 1000 },
  async () => {
    const pending = [deferred(), deferred(), deferred()];
    const thirdStarted = deferred();
    const calls: number[] = [];
    const result = mapLimit([0, 1, 2], 2, (id) => {
      calls.push(id);
      if (id === 2) thirdStarted.resolve(1);
      return pending[id].promise;
    });
    assert.deepEqual(calls, [0, 1]);
    pending[1].resolve(20);
    await thirdStarted.promise;
    assert.deepEqual(calls, [0, 1, 2]);
    pending[2].resolve(30);
    pending[0].resolve(10);
    assert.deepEqual(Array.from(await result), [10, 20, 30]);
  },
);
test("review pool rejects on failure and does not start new work when an active peer later finishes", async () => {
  const pending = [deferred(), deferred()];
  const calls: number[] = [];
  const result = mapLimit([0, 1, 2, 3], 2, (id) => {
    calls.push(id);
    return pending[id].promise;
  });
  const rejected = assert.rejects(result, /offline/);
  pending[0].reject(new Error("offline"));
  await rejected;
  pending[1].resolve(1);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [0, 1]);
});
test("review pool handles empty input, duplicate IDs and invalid limits", async () => {
  assert.deepEqual(Array.from(await mapLimit([], 3, async (id) => id)), []);
  let calls = 0;
  assert.deepEqual(
    Array.from(
      await mapLimit([7, 7], 9, async (id) => {
        calls++;
        return id;
      }),
    ),
    [7, 7],
  );
  assert.equal(calls, 2);
  await assert.rejects(
    mapLimit([1], 0, async (id) => id),
    /Invalid limit/,
  );
});
