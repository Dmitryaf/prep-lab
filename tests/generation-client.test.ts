import test from "node:test";
import assert from "node:assert/strict";
import {
  readGenerationStream,
  type GenerationEvent,
} from "#ui/features/generate-material/api/generations.ts";
function response(chunks: Uint8Array[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  );
}
const encoder = new TextEncoder();
test("generation NDJSON preserves split UTF-8 and chunks across JSON line boundaries", async () => {
  const bytes = encoder.encode(
    '{"id":"job"}\n{"delta":"Микрозадачи"}\n{"done":true}\n',
  );
  const events: GenerationEvent[] = [];
  await readGenerationStream(
    response(Array.from(bytes, (byte) => Uint8Array.of(byte))),
    (event) => events.push(event),
  );
  assert.deepEqual(events, [
    { id: "job" },
    { delta: "Микрозадачи" },
    { done: true },
  ]);
});
test("truncated response and explicit error stop reading without a retry", async () => {
  const events: GenerationEvent[] = [];
  await assert.rejects(
    readGenerationStream(
      response([encoder.encode('{"id":"job"}\n{"delta":"часть"}\n')]),
      (event) => events.push(event),
    ),
    /Связь прервалась/,
  );
  assert.deepEqual(events, [{ id: "job" }, { delta: "часть" }]);
  await assert.rejects(
    readGenerationStream(
      response([encoder.encode('{"error":"Сервер отказал"}\n')]),
      () => {},
    ),
    /Сервер отказал/,
  );
});
test("invalid UTF-8 and events after terminal completion cannot silently alter the answer", async () => {
  const invalid = new Uint8Array([
    ...encoder.encode('{"delta":"'),
    0xc0,
    0xaf,
    ...encoder.encode('"}\n{"done":true}\n'),
  ]);
  await assert.rejects(readGenerationStream(response([invalid]), () => {}));
  await assert.rejects(
    readGenerationStream(
      response([encoder.encode('{"done":true}\n{"delta":"лишний текст"}\n')]),
      () => {},
    ),
    /заверш|формат/,
  );
});
