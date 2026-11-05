import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const note = readFileSync(
  new URL(
    "../content/common/Собеседования/Практика/Ревью JavaScript и TypeScript.md",
    import.meta.url,
  ),
  "utf8",
).replace(/^> ?/gm, "");
function example(marker: string, name: string, globals: object = {}) {
  const blocks = [...note.matchAll(/```(?:js|javascript)\n([\s\S]*?)```/g)];
  const source = blocks.find((block) =>
    block[1].includes(`checked-example: ${marker}`),
  )?.[1];
  assert(source, `Missing runnable solution: ${marker}`);
  return runInNewContext(`${source}\n${name}`, globals);
}

test("indexed review solution preserves first duplicate match, missing users and immutable inputs", () => {
  const joinOrders = example("review-user-index", "joinOrders") as (
    orders: object[],
    users: object[],
  ) => { user?: object }[];
  const first = Object.freeze({ id: "a", name: "first" });
  const users = Object.freeze([
    first,
    Object.freeze({ id: "a", name: "second" }),
  ]);
  const orders = Object.freeze([
    Object.freeze({ userId: "a" }),
    Object.freeze({ userId: "missing" }),
  ]);
  const rows = joinOrders([...orders], [...users]);
  assert.equal(rows[0].user, first);
  assert.equal(rows[1].user, undefined);
  assert.notEqual(rows[0], orders[0]);
  assert.equal(users.length, 2);
});

test("review HTTP solution encodes path segments, propagates abort and rejects bad status or payload", async () => {
  let response = {
    ok: true,
    status: 200,
    json: async (): Promise<unknown> => ({ id: "a", name: "Alex" }),
  };
  let calledUrl = "",
    calledSignal: AbortSignal | undefined;
  const loadUser = example("review-http-user", "loadUser", {
    encodeURIComponent,
    fetch: async (url: string, options: { signal?: AbortSignal }) => {
      calledUrl = url;
      calledSignal = options.signal;
      return response;
    },
  }) as (
    id: string,
    options?: { signal: AbortSignal },
  ) => Promise<{ id: string; name: string }>;
  const controller = new AbortController();
  const user = await loadUser("a/b?x", { signal: controller.signal });
  assert.equal(calledUrl, "/api/users/a%2Fb%3Fx");
  assert.equal(calledSignal, controller.signal);
  assert.equal(user.name, "Alex");
  response = {
    ok: false,
    status: 404,
    json: async () => {
      throw new Error("must not read body");
    },
  };
  await assert.rejects(loadUser("missing"), /HTTP 404/);
  response = {
    ok: true,
    status: 200,
    json: async () => ({ id: 123, name: "Alex" }),
  };
  await assert.rejects(loadUser("bad"), /Invalid user response/);
  response = {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("JSON");
    },
  };
  await assert.rejects(loadUser("json"), /JSON/);
});
