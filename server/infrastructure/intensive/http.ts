import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  intensiveGoalSchema,
  intensiveLessonIdsSchema,
  intensiveProgressInputSchema,
  intensiveRevisionSchema,
} from "#domain/intensive/contracts.ts";
import { IntensiveInputError } from "#domain/intensive/program.ts";
import { composeIntensivePrompt } from "#domain/intensive/assistant.ts";
import type { IntensiveService } from "#server/application/intensive/service.ts";
import { RevisionConflict } from "#server/infrastructure/storage/preparation.ts";
import {
  readJsonBody,
  respondJson,
  InvalidBody,
} from "#server/infrastructure/http/json.ts";

export async function handleIntensive(
  request: IncomingMessage,
  response: ServerResponse,
  provider: IntensiveService | (() => IntensiveService),
) {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path !== "/api/intensive" && !path.startsWith("/api/intensive/"))
    return false;
  const service = () =>
    typeof provider === "function" ? provider() : provider;
  try {
    if (request.method === "GET") {
      if (path === "/api/intensive")
        respondJson(response, 200, service().read());
      else if (path === "/api/intensive/catalog")
        respondJson(response, 200, await service().catalog());
      else respondJson(response, 404, { error: "Раздел не найден." });
      return true;
    }
    if (request.method !== "POST" && request.method !== "PUT") {
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
    const raw = await readJsonBody(request, 2_000_000);
    let result;
    if (path === "/api/intensive/prompt" && request.method === "POST") {
      const input = z.object({ goal: intensiveGoalSchema }).parse(raw);
      result = {
        prompt: composeIntensivePrompt(
          input.goal,
          await service().preview(input.goal),
        ),
      };
    } else if (path === "/api/intensive/draft" && request.method === "POST") {
      const input = z
        .object({
          goal: intensiveGoalSchema,
          expectedRevision: intensiveRevisionSchema,
        })
        .parse(raw);
      result = await service().draft(input.goal, input.expectedRevision);
    } else if (path === "/api/intensive/propose" && request.method === "POST") {
      const input = z
        .object({
          goal: intensiveGoalSchema,
          lessonIds: intensiveLessonIdsSchema,
          expectedRevision: intensiveRevisionSchema,
        })
        .parse(raw);
      result = await service().propose(
        input.goal,
        input.lessonIds,
        input.expectedRevision,
      );
    } else if (path === "/api/intensive/accept" && request.method === "POST") {
      const input = z
        .object({
          lessonIds: intensiveLessonIdsSchema,
          expectedRevision: intensiveRevisionSchema,
        })
        .parse(raw);
      result = await service().accept(input.lessonIds, input.expectedRevision);
    } else if (path === "/api/intensive/progress" && request.method === "PUT") {
      const input = z
        .object({
          lessonId: z.string(),
          progress: intensiveProgressInputSchema,
          expectedRevision: intensiveRevisionSchema,
        })
        .parse(raw);
      result = service().updateProgress(
        input.lessonId,
        input.progress,
        input.expectedRevision,
      );
    } else if (
      path === "/api/intensive/tomorrow" &&
      request.method === "POST"
    ) {
      const input = z
        .object({
          lessonId: z.string(),
          text: z.string().trim().min(1).max(10_000),
          expectedRevision: intensiveRevisionSchema,
        })
        .parse(raw);
      result = service().addRepeat(
        input.lessonId,
        input.text,
        input.expectedRevision,
      );
    } else if (path === "/api/intensive/tomorrow" && request.method === "PUT") {
      const input = z
        .object({
          id: z.string(),
          done: z.boolean(),
          expectedRevision: intensiveRevisionSchema,
        })
        .parse(raw);
      result = service().updateRepeat(
        input.id,
        input.done,
        input.expectedRevision,
      );
    } else {
      respondJson(response, 404, { error: "Операция не найдена." });
      return true;
    }
    respondJson(response, 200, result);
  } catch (error) {
    if (error instanceof RevisionConflict)
      respondJson(response, 409, { error: error.message });
    else if (error instanceof IntensiveInputError)
      respondJson(response, 400, { error: error.message });
    else if (error instanceof z.ZodError || error instanceof InvalidBody)
      respondJson(response, 400, {
        error: "Проверьте цель, материалы и параметры занятия.",
      });
    else
      respondJson(response, 503, {
        error:
          "Не удалось прочитать или сохранить интенсив. Предыдущие данные сохранены.",
      });
  }
  return true;
}
