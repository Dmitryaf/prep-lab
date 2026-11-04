import test from "node:test";
import assert from "node:assert/strict";
import { AssistantRuntime } from "../server/infrastructure/codex/runtime.ts";
import type {
  CodexTransport,
  TransportMessage,
} from "../server/infrastructure/codex/transport.ts";
import { Codex } from "../server/codex.ts";
const options = (signal = new AbortController().signal) => ({
  context: "Тестовый материал",
  messages: [
    { role: "user" as const, text: "Объясни", status: "completed" as const },
  ],
  signal,
  onDelta: (_text: string) => {},
});
function fake() {
  const listeners = new Set<(message: TransportMessage) => void>();
  const calls: { method: string; params: unknown }[] = [];
  let closed = false;
  const transport: CodexTransport = {
    async initialize() {},
    async call(method, params) {
      calls.push({ method, params });
      if (method === "thread/start") return { thread: { id: "thread-test" } };
      if (method === "turn/start") return { turn: { id: "turn-test" } };
      return {};
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      closed = true;
    },
  };
  const emit = (method: string, params: unknown) => {
    for (const listener of listeners) listener({ method, params });
  };
  return { transport, calls, emit, closed: () => closed };
}
test("runtime serializes all callers, streams one completed turn and never retries", async () => {
  const probe = fake(),
    runtime = new AssistantRuntime({
      accessToken: async () => "synthetic",
      transport: () => probe.transport,
    });
  const first = runtime.answer(options());
  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.rejects(runtime.answer(options()), /выполняется/i);
  probe.emit("item/agentMessage/delta", {
    threadId: "thread-test",
    delta: "Ответ",
  });
  probe.emit("turn/completed", {
    threadId: "thread-test",
    turn: { status: "completed" },
  });
  assert.equal(await first, "Ответ");
  assert.equal(
    probe.calls.filter((call) => call.method === "turn/start").length,
    1,
  );
  assert.equal(runtime.active, false);
  assert(probe.closed());
});
test("closing a busy discussion facade cannot cancel another scenario's active operation", async () => {
  const probe = fake(),
    runtime = new AssistantRuntime({
      accessToken: async () => "synthetic",
      transport: () => probe.transport,
    });
  const active = runtime.answer(options());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const discussion = new Codex(runtime);
  await assert.rejects(discussion.answer(options()), /выполняется/i);
  discussion.close();
  assert(!probe.calls.some((call) => call.method === "turn/interrupt"));
  probe.emit("item/agentMessage/delta", {
    threadId: "thread-test",
    delta: "Другой сценарий завершён",
  });
  probe.emit("turn/completed", {
    threadId: "thread-test",
    turn: { status: "completed" },
  });
  assert.equal(await active, "Другой сценарий завершён");
});
test("raw material stays in JSON input while only an internal task reaches developer instructions", async () => {
  const probe = fake(),
    runtime = new AssistantRuntime({
      accessToken: async () => "synthetic",
      transport: () => probe.transport,
    });
  const pending = runtime.answer({
    ...options(),
    context: "UNTRUSTED MATERIAL",
    trustedTask: "INTERNAL TASK",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const thread = probe.calls.find((call) => call.method === "thread/start")!
    .params as { developerInstructions: string };
  assert(thread.developerInstructions.includes("INTERNAL TASK"));
  assert(!thread.developerInstructions.includes("UNTRUSTED MATERIAL"));
  const turn = probe.calls.find((call) => call.method === "turn/start")!
    .params as { input: { text: string }[] };
  assert.equal(JSON.parse(turn.input[0].text).material, "UNTRUSTED MATERIAL");
  probe.emit("item/agentMessage/delta", {
    threadId: "thread-test",
    delta: "Ответ",
  });
  probe.emit("turn/completed", {
    threadId: "thread-test",
    turn: { status: "completed" },
  });
  await pending;
});
test("cancel interrupts an accepted turn, closes transport and preserves streamed text for caller persistence", async () => {
  const probe = fake(),
    runtime = new AssistantRuntime({
      accessToken: async () => "synthetic",
      transport: () => probe.transport,
    });
  const controller = new AbortController(),
    deltas: string[] = [];
  const result = runtime.answer({
    ...options(controller.signal),
    onDelta: (text) => deltas.push(text),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  probe.emit("item/agentMessage/delta", {
    threadId: "thread-test",
    delta: "Часть ответа",
  });
  controller.abort();
  await assert.rejects(result, /остановлен/i);
  assert.deepEqual(deltas, ["Часть ответа"]);
  assert(probe.calls.some((call) => call.method === "turn/interrupt"));
  assert(probe.closed());
  assert.equal(runtime.active, false);
});
test("disconnect and failed completion fail once without automatic second turn", async () => {
  for (const failed of ["transport/closed", "turn/completed"]) {
    const probe = fake(),
      runtime = new AssistantRuntime({
        accessToken: async () => "synthetic",
        transport: () => probe.transport,
      });
    const result = runtime.answer(options());
    await new Promise((resolve) => setTimeout(resolve, 0));
    probe.emit(failed, { threadId: "thread-test", turn: { status: "failed" } });
    await assert.rejects(result);
    assert.equal(
      probe.calls.filter((call) => call.method === "turn/start").length,
      1,
    );
  }
});
