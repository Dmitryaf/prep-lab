import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  migratePreparationInput,
  savePreparationInput,
} from "../../../domain/interview/contracts.ts";
import {
  PreparationRepository,
  RevisionConflict,
} from "../storage/preparation.ts";

import { readJsonBody, InvalidBody, respondJson as respond } from "./json.ts";
const body = (request: IncomingMessage) => readJsonBody(request, 15_000_000);
export async function handlePreparation(
  request: IncomingMessage,
  response: ServerResponse,
  source: PreparationRepository | (() => PreparationRepository),
) {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (!path.startsWith("/api/preparation")) return false;
  try {
    const repository = () => (typeof source === "function" ? source() : source);
    if (path === "/api/preparation" && request.method === "GET") {
      respond(response, 200, repository().read());
      return true;
    }
    if (request.method !== "PUT" && request.method !== "POST") {
      respond(response, 405, { error: "Метод не поддерживается." });
      return true;
    }
    const expectedOrigin =
      process.env.FRONTEND_LAB_ORIGIN || `http://${request.headers.host}`;
    if (request.headers.origin !== expectedOrigin) {
      respond(response, 403, { error: "Запрос с этого адреса не разрешён." });
      return true;
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      respond(response, 415, { error: "Ожидается JSON." });
      return true;
    }
    if (path === "/api/preparation" && request.method === "PUT") {
      const input = savePreparationInput.parse(await body(request));
      respond(
        response,
        200,
        repository().save(input.state, input.expectedRevision),
      );
      return true;
    }
    if (path === "/api/preparation/migrate" && request.method === "POST") {
      const input = migratePreparationInput.parse(await body(request));
      respond(response, 200, repository().migrate(input.state));
      return true;
    }
    respond(response, 404, { error: "Операция не найдена." });
  } catch (error) {
    if (error instanceof RevisionConflict)
      respond(response, 409, { error: error.message });
    else if (error instanceof z.ZodError || error instanceof InvalidBody)
      respond(response, 400, {
        error:
          "Данные подготовки не прошли проверку. Прежняя запись сохранена.",
      });
    else
      respond(response, 503, {
        error:
          "Не удалось прочитать или сохранить данные экземпляра. Прежние файлы не заменены.",
      });
  }
  return true;
}
