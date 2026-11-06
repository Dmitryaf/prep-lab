import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { promptInputSchema } from "#domain/prompts/contracts.ts";
import { scenarioSchema } from "#domain/generation/contracts.ts";
import type { GenerationService } from "#server/application/generations.ts";
import { readJsonBody, respondJson, InvalidBody } from "./json.ts";
import { RevisionConflict } from "#server/infrastructure/storage/preparation.ts";
export async function handleGenerations(
  request: IncomingMessage,
  response: ServerResponse,
  provider: GenerationService | (() => GenerationService),
  revision: () => number,
) {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path !== "/api/generations" && !path.startsWith("/api/generations/"))
    return false;
  const service = () =>
    typeof provider === "function" ? provider() : provider;
  try {
    if (path === "/api/generations" && request.method === "GET") {
      respondJson(response, 200, {
        jobs: service()
          .repository.list()
          .map(({ id, scenario, status, createdAt, input }) => ({
            id,
            scenario,
            status,
            createdAt,
            request: input.request,
          })),
        revision: revision(),
      });
      return true;
    }
    const match =
      /^\/api\/generations\/([a-f0-9-]{36})(?:\/(accept|cancel))?$/.exec(path);
    if (match && !match[2] && request.method === "GET") {
      respondJson(response, 200, service().repository.read(match[1]));
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
    const raw = await readJsonBody(request, 1_200_000);
    if (path === "/api/generations") {
      const input = z
        .strictObject({
          scenario: scenarioSchema,
          input: promptInputSchema,
          expectedPrompt: z.string().max(600000),
        })
        .parse(raw);
      const controller = new AbortController();
      const disconnected = () => controller.abort();
      response.on("close", disconnected);
      try {
        await service().run(
          input.scenario,
          input.input,
          (event) => {
            if (!response.headersSent)
              response.writeHead(200, {
                "Content-Type": "application/x-ndjson; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
              });
            if (!response.destroyed)
              response.write(JSON.stringify(event) + "\n");
          },
          controller.signal,
          input.expectedPrompt,
        );
      } finally {
        response.off("close", disconnected);
      }
      if (!response.destroyed) response.end();
      return true;
    }
    if (match?.[2] === "cancel") {
      z.strictObject({}).parse(raw);
      service().cancel(match[1]);
      respondJson(response, 200, { cancelled: true });
      return true;
    }
    if (match?.[2] === "accept") {
      const input = z
        .strictObject({
          revision: z.number().int().nonnegative(),
          draft: z.unknown(),
        })
        .parse(raw);
      respondJson(
        response,
        200,
        await service().accept(match[1], input.draft, input.revision),
      );
      return true;
    }
    respondJson(response, 404, { error: "Операция не найдена." });
  } catch (error) {
    if (response.headersSent) {
      if (!response.destroyed)
        response.end(
          JSON.stringify({
            error:
              "Не удалось сохранить результат. Автоматического повтора нет.",
          }) + "\n",
        );
    } else if (error instanceof RevisionConflict)
      respondJson(response, 409, { error: error.message });
    else if (error instanceof z.ZodError || error instanceof InvalidBody)
      respondJson(response, 400, {
        error: "Задание или результат не прошли проверку.",
      });
    else
      respondJson(response, 503, {
        error: "Подготовка недоступна. Принятые данные сохранены.",
      });
  }
  return true;
}
