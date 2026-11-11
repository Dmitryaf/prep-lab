import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceId } from "#server/infrastructure/workspace.ts";

import type { SpawnOptions } from "node:child_process";
type Service = { close: () => Promise<void> };
interface Health {
  application: string;
  workspace: string;
  autoClose: boolean;
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function probe(
  base: string,
  pageTimeoutMs = 1000,
): Promise<Health | null> {
  try {
    const response = await fetch(base + "/api/health", {
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.application !== "projects-map" || data.workspace !== workspaceId)
      return null;
    const page = await fetch(base + "/", {
      signal: AbortSignal.timeout(pageTimeoutMs),
    });
    return page.ok && /id="(?:app|__nuxt)"/.test(await page.text())
      ? data
      : null;
  } catch {
    return null;
  }
}

export async function ensureRunning({
  port = 4173,
  start,
}: {
  port?: number;
  start: (port: number) => Promise<Service>;
}) {
  const base = `http://127.0.0.1:${port}`;
  if (await probe(base)) return { base, reused: true };
  // A free port is claimed by Vite with strictPort. No other process is stopped.
  try {
    const service = await start(port);
    // Nuxt compiles the first page on demand after the HTTP listener is ready.
    if (!(await probe(base, 10000))) {
      await service.close();
      throw Error("Сервер запущен, но проверка готовности не прошла.");
    }
    return { base, reused: false, service };
  } catch (error) {
    // Another double-click may have started the same application concurrently.
    if (await probe(base)) return { base, reused: true };
    throw Error(
      `Не удалось запустить платформу на ${base}. Если порт занят другой программой или старой версией платформы, закройте её и повторите запуск. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function run(command: string, args: string[], options: SpawnOptions = {}) {
  return new Promise<void>((accept, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? accept()
        : reject(Error(`Команда завершилась с кодом ${code}.`)),
    );
  });
}

async function main() {
  process.chdir(root);
  const logs = resolve(root, "artifacts/launcher");
  mkdirSync(logs, { recursive: true });
  const log = openSync(resolve(logs, "launch.log"), "a");
  // Hidden launch keeps diagnostics available without a permanent terminal window.
  process.stdout.write = (
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ) => {
    writeSync(log, String(chunk));
    if (typeof encoding === "function") encoding();
    else callback?.();
    return true;
  };
  process.stderr.write = process.stdout.write;
  try {
    const result = await ensureRunning({
      start: async (port) => {
        const [major, minor, patch] = process.versions.node
          .split(".")
          .map(Number);
        const supported =
          major >= 26 ||
          (major === 24 && minor >= 15) ||
          (major === 22 && (minor > 22 || (minor === 22 && patch >= 3)));
        if (!supported)
          throw Error(
            "Для Nuxt нужен Node.js 22.22.3+, 24.15+ либо 26+. Обновите Node.js и повторите запуск.",
          );
        if (
          !existsSync(resolve(root, "node_modules/nuxt/package.json")) ||
          !existsSync(resolve(root, "node_modules/vue/package.json"))
        ) {
          await run(
            process.env.ComSpec || "cmd.exe",
            ["/d", "/s", "/c", "npm ci --ignore-scripts"],
            { cwd: root, stdio: ["ignore", log, log] },
          );
        }
        const { createDevelopmentServer } = await import("./dev.ts");
        const service = await createDevelopmentServer({
          port,
          lifecycle: { onIdle: () => service.close() },
        });
        return service;
      },
    });
    await run("rundll32.exe", ["url.dll,FileProtocolHandler", result.base], {
      stdio: "ignore",
    });
    if (result.reused) process.exitCode = 0;
  } catch (error) {
    const message = `${error instanceof Error ? error.message : String(error)}\n\nЖурнал: ${resolve(logs, "launch.log")}`;
    process.stderr.write(message + "\n");
    await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($env:PROJECTS_MAP_ERROR, 'Prep Lab') | Out-Null",
      ],
      { env: { ...process.env, PROJECTS_MAP_ERROR: message }, stdio: "ignore" },
    ).catch(() => {});
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
