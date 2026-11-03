import type { Page } from "@playwright/test";

import { test, expect } from "@playwright/test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function worker(env = {}) {
  const process = fork(
    new URL("../fixtures/lifecycle-server.ts", import.meta.url),
    [],
    {
      windowsHide: true,
      execArgv: ["--experimental-strip-types"],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: { ...globalThis.process.env, ...env },
    },
  );
  const exit = once(process, "exit");
  const [{ base }] = await once(process, "message");
  return { process, exit, base };
}
type LifecycleWorker = Awaited<ReturnType<typeof worker>>;
async function exited(worker: LifecycleWorker) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const [code] = await Promise.race([
      worker.exit,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(Error("Server process did not exit")),
          10000,
        );
      }),
    ]);
    expect(code).toBe(0);
  } finally {
    clearTimeout(timeout);
  }
}

test("server lifecycle", async ({ browser }) => {
  const directory = mkdtempSync(join(tmpdir(), "map-lifecycle-browser-"));
  const live = await worker({ TEST_CHAT_DIR: directory });
  try {
    const context = await browser.newContext();
    const first = await context.newPage();
    const open = async (page: Page) => {
      const connected = page.waitForResponse((r) =>
        r.url().endsWith("/api/lifecycle"),
      );
      await page.goto(live.base);
      expect((await connected).status()).toBe(200);
    };
    await open(first);
    const second = await context.newPage();
    await open(second);
    await first.close();
    await delay(1100);
    expect(live.process.exitCode).toBe(null);
    expect((await fetch(live.base + "/")).status).toBe(200);
    const connection = second.waitForResponse((r) =>
      r.url().endsWith("/api/lifecycle"),
    );
    await second.reload();
    await connection;
    await delay(1100);
    expect(live.process.exitCode).toBe(null);

    await second.close();
    await exited(live);
    await expect(() => fetch(live.base + "/")).rejects.toBeDefined();
    const neverOpened = await worker({ TEST_STARTUP_MS: "200" });
    try {
      await exited(neverOpened);
    } finally {
      neverOpened.process.kill();
    }
    console.log(
      "PASS lifecycle: real Vite proxy, two tabs, background tab, reload, last close releases port and exits process, startup timeout",
    );
  } finally {
    live.process.kill();
    rmSync(directory, { recursive: true, force: true });
  }
});
