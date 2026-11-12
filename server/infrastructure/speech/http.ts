import type { IncomingMessage, ServerResponse } from "node:http";
import { speechMaxBytes, validateSpeechWav } from "#domain/speech/wav.ts";
import { respondJson } from "#server/infrastructure/http/json.ts";
import { transcribeLocal, whisperAvailable } from "./whisper.ts";

export function createSpeechHandler(
  options: {
    available?: () => boolean;
    transcribe?: (bytes: Uint8Array, signal: AbortSignal) => Promise<string>;
  } = {},
) {
  let active = false;
  return async (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url || "/", "http://localhost").pathname;
    if (path !== "/api/speech") return false;
    if (request.method === "GET") {
      respondJson(response, 200, {
        available: (options.available || whisperAvailable)(),
        provider: "Локальный Whisper",
        maxBytes: speechMaxBytes,
      });
      return true;
    }
    if (request.method !== "POST") {
      respondJson(response, 405, { error: "Метод не поддерживается." });
      return true;
    }
    if (
      request.headers.origin !==
      (process.env.FRONTEND_LAB_ORIGIN || `http://${request.headers.host}`)
    ) {
      respondJson(response, 403, {
        error: "Запрос с этого адреса не разрешён.",
      });
      return true;
    }
    if (request.headers["content-type"] !== "audio/wav") {
      respondJson(response, 415, { error: "Ожидается WAV-запись." });
      return true;
    }
    if (active) {
      respondJson(response, 409, {
        error: "Уже распознаётся другая запись. Повторите после её завершения.",
      });
      return true;
    }
    if (Number(request.headers["content-length"]) > speechMaxBytes) {
      respondJson(response, 413, { error: "Запись слишком большая." });
      return true;
    }
    active = true;
    const controller = new AbortController();
    const abort = () => controller.abort();
    response.once("close", abort);
    const timeout = setTimeout(abort, 10 * 60_000);
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > speechMaxBytes) throw new Error("Запись слишком большая.");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      try {
        validateSpeechWav(bytes);
      } catch (error) {
        respondJson(response, 400, { error: (error as Error).message });
        return true;
      }
      const text = await (options.transcribe || transcribeLocal)(
        bytes,
        controller.signal,
      );
      if (text.length > 100_000)
        throw new Error("Результат слишком большой. Разделите запись.");
      if (!response.destroyed) respondJson(response, 200, { text });
    } catch (error) {
      if (!response.destroyed)
        respondJson(response, 503, {
          error: controller.signal.aborted
            ? "Распознавание остановлено. Запись можно отправить повторно."
            : error instanceof Error
              ? error.message
              : "Не удалось распознать запись.",
        });
    } finally {
      clearTimeout(timeout);
      response.off("close", abort);
      active = false;
    }
    return true;
  };
}
