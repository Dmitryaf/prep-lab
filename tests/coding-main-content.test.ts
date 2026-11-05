import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ref } from "vue";

function example(file: string, marker: string) {
  const markdown = readFileSync(
    new URL(
      `../content/common/Собеседования/Практика/${file}.md`,
      import.meta.url,
    ),
    "utf8",
  )
    .replace(/^> ?/gm, "")
    .replace(/\r\n/g, "\n");
  const code = [...markdown.matchAll(/```js\n([\s\S]*?)```/g)].find((match) =>
    match[1].includes(`// checked-example: ${marker}`),
  )?.[1];
  assert(code, `Missing runnable solution: ${marker}`);
  return code.replace(/^import .* from 'vue';\n/gm, "");
}

test("main search filters without reordering or mutating users", () => {
  const filter = vm.runInNewContext(
    example("React", "react-search-base") + "\nfilterUsers",
  );
  const users = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Malik" },
    { id: "3", name: "Bob" },
  ];
  assert.deepEqual(Array.from(filter(users, " ALI ")), users.slice(0, 2));
  assert.deepEqual(Array.from(filter(users, "  ")), users);
  assert.deepEqual(Array.from(filter(users, "?")), []);
  assert.equal(users.length, 3);
});

test("main Vue todo solution isolates initial data and handles add toggle delete", () => {
  const useTodos = vm.runInNewContext(
    example("Vue", "vue-todos-base") + "\nuseTodos",
    { ref, Error },
  );
  const input = [{ id: "old", text: "Read", isDone: false }];
  const todo = useTodos(input, () => "new");
  todo.text.value = "  Write  ";
  todo.addItem();
  assert.equal(todo.text.value, "");
  assert.equal(todo.items.value[1].text, "Write");
  todo.toggleItem("old");
  assert.equal(todo.items.value[0].isDone, true);
  assert.equal(input[0].isDone, false);
  todo.deleteItem("old");
  todo.text.value = "  ";
  todo.addItem();
  todo.toggleItem("missing");
  todo.deleteItem("missing");
  assert.equal(todo.items.value.length, 1);
  assert.equal(input.length, 1);
});

test("main Vue loader exposes pending success error and a working retry", async () => {
  const useFetch = vm.runInNewContext(
    example("Vue", "vue-fetch-base") + "\nuseFetch",
    { ref, Error },
  );
  let finish!: (value: unknown) => void;
  let calls = 0;
  const request = () => {
    calls++;
    if (calls === 1)
      return new Promise((resolve) => {
        finish = resolve;
      });
    if (calls === 2) return Promise.reject(new Error("Offline"));
    return Promise.resolve([]);
  };
  const state = useFetch("/users", request);
  const first = state.load();
  assert.equal(state.loading.value, true);
  await state.load();
  assert.equal(calls, 1);
  finish([{ id: "a", name: "Alice" }]);
  await first;
  assert.equal(state.loading.value, false);
  assert.equal(state.data.value[0].id, "a");
  await state.load();
  assert.equal(state.error.value.message, "Offline");
  assert.equal(state.loading.value, false);
  await state.load();
  assert.equal(state.error.value, null);
  assert.equal(state.data.value.length, 0);
});

test("base batch loader preserves order and duplicates and rejects missing records", async () => {
  const createLoader = vm.runInNewContext(
    example("Асинхронные контракты", "batch-base") + "\ncreateLoader",
    { Map },
  );
  let calls = 0;
  const get = createLoader(async () => {
    calls++;
    return new Map([
      ["a", 1],
      ["b", undefined],
    ]);
  });
  assert.deepEqual(Array.from(await get(["b", "a", "b"])), [
    undefined,
    1,
    undefined,
  ]);
  assert.deepEqual(Array.from(await get([])), []);
  assert.equal(calls, 1);
  await assert.rejects(get(["missing"]), /Missing/);
  await assert.rejects(get([""]), /IDs/);
});

test("Vue loader reports even a falsy rejection as an error", async () => {
  const useFetch = vm.runInNewContext(
    example("Vue", "vue-fetch-base") + "\nuseFetch",
    { ref, Error },
  );
  for (const reason of [undefined, null, 0, ""]) {
    const state = useFetch("/users", () => Promise.reject(reason));
    await state.load();
    assert(
      state.error.value,
      "a rejected request must not look like an empty success",
    );
    assert.equal(state.loading.value, false);
  }
});

test("cache stage distinguishes undefined from miss and never stores an incomplete batch", async () => {
  const createLoader = vm.runInNewContext(
    example("Асинхронные контракты", "batch-cache-stage") +
      "\ncreateCachedLoader",
    { Map, Set },
  );
  const cache = new Map([["a", undefined]]);
  const requested: string[][] = [];
  const get = createLoader(async (ids: string[]) => {
    requested.push(Array.from(ids));
    return new Map([["b", 2]]);
  }, cache);
  assert.deepEqual(Array.from(await get(["a", "b", "b"])), [undefined, 2, 2]);
  assert.deepEqual(requested, [["b"]]);
  await assert.rejects(get(["b", "c"]), /Missing/);
  assert.equal(cache.has("c"), false);
  const partialCache = new Map();
  const partial = createLoader(
    async () => new Map([["new-ok", 3]]),
    partialCache,
  );
  await assert.rejects(partial(["new-ok", "new-missing"]), /Missing/);
  assert.equal(partialCache.has("new-ok"), false);
  assert.equal(partialCache.has("new-missing"), false);
});

test("invalidated older request cannot repopulate cache after a newer response", async () => {
  const createLoader = vm.runInNewContext(
    example("Асинхронные контракты", "batch-version-stage") +
      "\ncreateVersionedLoader",
    { Map, Set },
  );
  const pending: ((value: Map<string, number>) => void)[] = [];
  const cache = new Map();
  const loader = createLoader(
    () => new Promise((resolve) => pending.push(resolve)),
    cache,
  );
  const old = loader.getByIds(["a"]);
  loader.invalidate("a");
  const fresh = loader.getByIds(["a"]);
  pending[1](new Map([["a", 2]]));
  assert.deepEqual(Array.from(await fresh), [2]);
  pending[0](new Map([["a", 1]]));
  assert.deepEqual(Array.from(await old), [1]);
  assert.equal(cache.get("a"), 2);
  assert.deepEqual(Array.from(await loader.getByIds(["a"])), [2]);
  assert.equal(pending.length, 2);
});
