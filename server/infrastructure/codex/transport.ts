import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { z } from "zod";
import { protectDirectory } from "./credentials.ts";
export interface TransportMessage {
  method?: string;
  params?: unknown;
}
export interface CodexTransport {
  initialize(): Promise<void>;
  call(method: string, params: unknown): Promise<unknown>;
  onMessage(listener: (message: TransportMessage) => void): () => void;
  close(): Promise<void>;
}
const rpcSchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});
export function appServerConfiguration() {
  return {
    model_provider: "openai_chatgpt_plan",
    "model_providers.openai_chatgpt_plan.name": "ChatGPT plan",
    "model_providers.openai_chatgpt_plan.base_url": "https://api.openai.com/v1",
    "model_providers.openai_chatgpt_plan.env_key": "ACCESS_TOKEN",
    "model_providers.openai_chatgpt_plan.wire_api": "responses",
    "model_providers.openai_chatgpt_plan.requires_openai_auth": false,
    "model_providers.openai_chatgpt_plan.supports_websockets": false,
    "model_providers.openai_chatgpt_plan.request_max_retries": 0,
    "model_providers.openai_chatgpt_plan.stream_max_retries": 0,
    sandbox_mode: "read-only",
    approval_policy: "never",
    web_search: "disabled",
    project_doc_max_bytes: 0,
    "features.shell_tool": false,
    "features.apps": false,
    "features.remote_plugin": false,
    "features.multi_agent": false,
    "features.hooks": false,
    "features.memories": false,
    "features.shell_snapshot": false,
    "analytics.enabled": false,
    mcp_servers: {},
  };
}
export class StdioCodexTransport implements CodexTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private listeners = new Set<(value: TransportMessage) => void>();
  private stopped = false;
  constructor(options: {
    command: string;
    directory: string;
    home: string;
    token: string;
  }) {
    protectDirectory(options.home);
    protectDirectory(options.directory);
    this.child = spawn(
      options.command,
      [
        "app-server",
        "--listen",
        "stdio://",
        ...Object.entries(appServerConfiguration()).flatMap(([key, value]) => [
          "-c",
          `${key}=${JSON.stringify(value)}`,
        ]),
      ],
      {
        cwd: options.directory,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          CODEX_HOME: options.home,
          ACCESS_TOKEN: options.token,
        },
      },
    );
    this.child.stderr.on("data", () => {});
    this.child.stdin.on("error", () => {});
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        return;
      }
      const parsed = rpcSchema.safeParse(raw);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.id !== undefined && message.method) {
        this.send({
          id: message.id,
          error: {
            code: -32601,
            message: "Tools, commands and approvals are disabled.",
          },
        });
        return;
      }
      const pending =
        typeof message.id === "number"
          ? this.pending.get(message.id)
          : undefined;
      if (pending) {
        this.pending.delete(message.id as number);
        clearTimeout(pending.timer);
        if (message.error)
          pending.reject(
            new Error(
              "Codex отклонил операцию. Проверьте подключение и доступ к модели.",
            ),
          );
        else pending.resolve(message.result);
      } else for (const listener of this.listeners) listener(message);
    });
    const closed = () => {
      this.stopped = true;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Соединение с Codex потеряно."));
      }
      this.pending.clear();
      for (const listener of this.listeners)
        listener({ method: "transport/closed" });
    };
    this.child.on("error", closed);
    this.child.on("exit", closed);
  }
  private send(value: unknown) {
    if (!this.child.stdin.destroyed)
      this.child.stdin.write(JSON.stringify(value) + "\n");
  }
  call(method: string, params: unknown) {
    if (
      !["initialize", "thread/start", "turn/start", "turn/interrupt"].includes(
        method,
      )
    )
      return Promise.reject(new Error("Операция Codex не разрешена."));
    if (this.stopped)
      return Promise.reject(new Error("Соединение с Codex закрыто."));
    return new Promise<unknown>((resolve, reject) => {
      const id = ++this.sequence,
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error("Codex не ответил вовремя."));
        }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async initialize() {
    await this.call("initialize", {
      clientInfo: {
        name: "frontend_lab",
        title: "Frontend Lab",
        version: "0.1.0",
      },
    });
    this.send({ method: "initialized", params: {} });
  }
  onMessage(listener: (message: TransportMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const closed = once(this.child, "exit").catch(() => {});
    this.child.kill();
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      closed,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 5000);
      }),
    ]);
    clearTimeout(timer);
    if (this.child.exitCode === null && this.child.signalCode === null)
      this.child.kill("SIGKILL");
  }
}
