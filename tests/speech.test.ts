import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { encodeWav, validateSpeechWav } from "#domain/speech/wav.ts";
import { createSpeechHandler } from "#server/infrastructure/speech/http.ts";

const audio = () => new Uint8Array(encodeWav(new Float32Array(1600)));

test("speech WAV has correct PCM samples and rejects malformed or excessive audio", () => {
  const bytes = new Uint8Array(encodeWav(new Float32Array([-2, -1, 0, 1, 2])));
  validateSpeechWav(bytes);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(48, true), 0);
  assert.equal(view.getInt16(52, true), 32767);
  assert.throws(() => validateSpeechWav(new Uint8Array(44)));
  assert.throws(() =>
    validateSpeechWav(new Uint8Array(encodeWav(new Float32Array(4), 48000))),
  );
  view.setUint32(40, 400, true);
  assert.throws(() => validateSpeechWav(bytes));
  assert.throws(() =>
    validateSpeechWav(new Uint8Array(encodeWav(new Float32Array(16000 * 901)))),
  );
});

test("speech API validates uploads, serializes recognition, cancels disconnects and accepts a retry", async () => {
  let calls = 0;
  let aborted = false;
  let waiting = false;
  let fail = false;
  const handle = createSpeechHandler({
    available: () => true,
    transcribe: async (bytes, signal) => {
      calls++;
      assert.deepEqual(bytes, Buffer.from(audio()));
      if (waiting) {
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              resolve();
            },
            { once: true },
          );
        });
        signal.throwIfAborted();
      }
      if (fail) throw new Error("Проверочная ошибка");
      return "Проверяем входные данные перед сохранением.";
    },
  });
  const server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const send = (body = audio(), headers = {}, signal?: AbortSignal) =>
    fetch(base + "/api/speech", {
      method: "POST",
      headers: { origin: base, "content-type": "audio/wav", ...headers },
      body,
      signal,
    });
  try {
    assert.equal(
      (await (await fetch(base + "/api/speech")).json()).available,
      true,
    );
    assert.equal(
      (await send(audio(), { origin: "https://other.example" })).status,
      403,
    );
    assert.equal(
      (await send(audio(), { "content-type": "text/plain" })).status,
      415,
    );
    assert.equal((await send(new Uint8Array(3))).status, 400);
    assert.equal(calls, 0);
    assert.deepEqual(await (await send()).json(), {
      text: "Проверяем входные данные перед сохранением.",
    });
    waiting = true;
    const controller = new AbortController();
    const pending = send(audio(), {}, controller.signal).catch(() => undefined);
    for (let i = 0; i < 100 && Number(calls) !== 2; i++) await delay(10);
    assert.equal(calls, 2);
    assert.equal((await send()).status, 409);
    controller.abort();
    await pending;
    for (let i = 0; i < 100 && !aborted; i++) await delay(10);
    assert.equal(aborted, true);
    waiting = false;
    fail = true;
    const failure = await send();
    assert.equal(failure.status, 503);
    assert.match((await failure.json()).error, /Проверочная ошибка/);
    assert.equal(calls, 3);
    fail = false;
    assert.equal((await send()).status, 200);
    assert.equal(calls, 4);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
