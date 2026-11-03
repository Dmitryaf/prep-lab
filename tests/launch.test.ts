import type { AddressInfo } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { createDevelopmentServer } from "../scripts/dev.ts";
import { ensureRunning } from "../scripts/launch.ts";

test("launcher cold start and repeated click use one ready server and keep the same origin", async () => {
  const probe = httpServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));
  let starts = 0;
  const start = async (port: number) => {
    starts++;
    return createDevelopmentServer({ port, databasePath: ":memory:" });
  };
  const first = await ensureRunning({ port, start });
  try {
    assert.equal(first.reused, false);
    assert.equal((await fetch(first.base + "/")).status, 200);
    const second = await ensureRunning({ port, start });
    assert.equal(second.reused, true);
    assert.equal(second.base, first.base);
    assert.equal(starts, 1);
    assert.equal(
      (await fetch(first.base + "/api/study-chat?key=launcher-probe")).status,
      200,
    );
  } finally {
    await first.service!.close();
  }
});
test("launcher rejects occupied foreign port without stopping its owner", async () => {
  const foreign = httpServer((req, res) => res.end("another application"));
  await new Promise<void>((r) => foreign.listen(0, "127.0.0.1", r));
  const port = (foreign.address() as AddressInfo).port;
  try {
    await assert.rejects(
      () =>
        ensureRunning({
          port,
          start: (port) =>
            createDevelopmentServer({ port, databasePath: ":memory:" }),
        }),
      /порт занят/i,
    );
    assert.equal(
      await (await fetch(`http://127.0.0.1:${port}/`)).text(),
      "another application",
    );
  } finally {
    foreign.closeAllConnections();
    await new Promise<void>((r) => foreign.close(() => r()));
  }
});
test("failed startup can be retried without a stale lock", async () => {
  const probe = httpServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));
  await assert.rejects(
    () =>
      ensureRunning({
        port,
        start: async () => {
          throw Error("test failure");
        },
      }),
    /test failure/,
  );
  const retry = await ensureRunning({
    port,
    start: (port) =>
      createDevelopmentServer({ port, databasePath: ":memory:" }),
  });
  assert.equal(retry.reused, false);
  await retry.service!.close();
});
