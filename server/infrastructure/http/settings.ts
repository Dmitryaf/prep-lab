import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  saveSettingsInput,
  migrateSettingsInput,
} from "#domain/instance/contracts.ts";
import { RevisionConflict } from "#server/infrastructure/storage/preparation.ts";
import type { SettingsRepository } from "#server/infrastructure/storage/settings.ts";
import { readJsonBody, InvalidBody, respondJson } from "./json.ts";

export async function handleSettings(
  request: IncomingMessage,
  response: ServerResponse,
  source: SettingsRepository | (() => SettingsRepository),
) {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (!path.startsWith("/api/settings")) return false;
  try {
    const repository = () => (typeof source === "function" ? source() : source);
    if (path === "/api/settings" && request.method === "GET") {
      respondJson(response, 200, repository().read());
      return true;
    }
    if (!["POST", "PUT"].includes(request.method || "")) {
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
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      respondJson(response, 415, { error: "Ожидается JSON." });
      return true;
    }
    if (path === "/api/settings" && request.method === "PUT") {
      const input = saveSettingsInput.parse(
        await readJsonBody(request, 20_000),
      );
      respondJson(
        response,
        200,
        repository().save(input.settings, input.revision),
      );
      return true;
    }
    if (path === "/api/settings/migrate" && request.method === "POST") {
      const input = migrateSettingsInput.parse(
        await readJsonBody(request, 20_000),
      );
      respondJson(
        response,
        200,
        repository().migrateSourceRoot(input.sourceRoot),
      );
      return true;
    }
    respondJson(response, 404, { error: "Операция не найдена." });
  } catch (error) {
    if (error instanceof RevisionConflict)
      respondJson(response, 409, { error: error.message });
    else if (error instanceof z.ZodError || error instanceof InvalidBody)
      respondJson(response, 400, {
        error: "Настройки не прошли проверку. Прежняя запись сохранена.",
      });
    else
      respondJson(response, 503, {
        error: "Настройки недоступны. Прежние данные сохранены.",
      });
  }
  return true;
}
