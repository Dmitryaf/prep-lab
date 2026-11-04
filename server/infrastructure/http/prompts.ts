import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { composePrompt } from "../../../domain/prompts/compose.ts";
import {
  promptInputSchema,
  promptSaveSchema,
  promptTemplateSchema,
  type PromptTemplate,
} from "../../../domain/prompts/contracts.ts";
import { PromptRepository } from "../storage/prompts.ts";
import { RevisionConflict } from "../storage/preparation.ts";
import { readJsonBody, respondJson, InvalidBody } from "./json.ts";

const previewInput = z.strictObject({
  text: z.string().trim().min(1).max(20000).nullable().optional(),
  input: promptInputSchema,
});

export async function handlePrompts(
  request: IncomingMessage,
  response: ServerResponse,
  source: PromptRepository | (() => PromptRepository),
  templates: () => PromptTemplate[] | Promise<PromptTemplate[]>,
) {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path !== "/api/prompts" && !path.startsWith("/api/prompts/"))
    return false;
  try {
    const repository = typeof source === "function" ? source() : source;
    const available = z
      .array(promptTemplateSchema)
      .length(3)
      .parse(await templates());
    if (new Set(available.map((template) => template.id)).size !== 3)
      throw new Error("Некорректный набор встроенных шаблонов.");
    if (request.method === "GET" && path === "/api/prompts") {
      respondJson(response, 200, {
        prompts: available.map((template) => repository.read(template)),
      });
      return true;
    }
    const match =
      /^\/api\/prompts\/(import|project|discussion)\/(save|preview)$/.exec(
        path,
      );
    if (!match) {
      respondJson(response, 404, { error: "Операция не найдена." });
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
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      respondJson(response, 415, { error: "Ожидается JSON." });
      return true;
    }
    const template = available.find((template) => template.id === match[1])!;
    const raw = await readJsonBody(request, 1_200_000);
    if (match[2] === "save") {
      respondJson(
        response,
        200,
        repository.save(template, promptSaveSchema.parse(raw)),
      );
    } else {
      const input = previewInput.parse(raw);
      const state = repository.read(template);
      const selected = input.text === undefined ? state.text : input.text;
      respondJson(response, 200, {
        prompt: composePrompt(template, selected, input.input),
        templateId: template.id,
        templateVersion: template.version,
        resultVersion: template.resultVersion,
      });
    }
  } catch (error) {
    if (error instanceof RevisionConflict)
      respondJson(response, 409, { error: error.message });
    else if (error instanceof z.ZodError || error instanceof InvalidBody)
      respondJson(response, 400, {
        error:
          "Промпт или контекст не прошли проверку. Сохранённая версия не изменена.",
      });
    else
      respondJson(response, 503, {
        error:
          "Не удалось прочитать или сохранить промпты. Прежние данные сохранены.",
      });
  }
  return true;
}
