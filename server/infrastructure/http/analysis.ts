import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve, relative, isAbsolute } from "node:path";
import { z } from "zod";
import { analysisRequestSchema } from "#domain/analysis/contracts.ts";
import type { AnalysisService } from "#server/application/analysis.ts";
import { readJsonBody, respondJson, InvalidBody } from "./json.ts";
import { RevisionConflict } from "#server/infrastructure/storage/preparation.ts";

export function allowedAnalysisPaths(
  request: IncomingMessage,
  paths: string[],
  roots: string[],
) {
  const remote = request.socket.remoteAddress;
  const local =
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote || "") &&
    /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(request.headers.host || "") &&
    !process.env.FRONTEND_LAB_ORIGIN;
  return paths.every(
    (path) =>
      isAbsolute(path) &&
      (local ||
        roots.some((root) => {
          const inside = relative(resolve(root), resolve(path));
          return (
            !isAbsolute(inside) &&
            inside !== ".." &&
            !inside.startsWith("..\\") &&
            !inside.startsWith("../")
          );
        })),
  );
}
export async function handleAnalysis(
  request: IncomingMessage,
  response: ServerResponse,
  provider: AnalysisService | (() => AnalysisService),
  roots: () => string[],
) {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path !== "/api/analysis" && !path.startsWith("/api/analysis/"))
    return false;
  const service = () =>
    typeof provider === "function" ? provider() : provider;
  try {
    const match =
      /^\/api\/analysis\/([a-f0-9-]{36})(?:\/(accept|cancel|update))?$/.exec(
        path,
      );
    if (request.method === "GET") {
      if (path === "/api/analysis")
        respondJson(response, 200, { jobs: service().list() });
      else if (match && !match[2])
        respondJson(response, 200, service().read(match[1]));
      else respondJson(response, 404, { error: "Анализ не найден." });
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
    const raw = await readJsonBody(request, 18_000_000);
    if (path === "/api/analysis") {
      const input = analysisRequestSchema.parse(raw);
      if (!allowedAnalysisPaths(request, input.paths, roots())) {
        respondJson(response, 403, {
          error:
            "Укажите абсолютный путь к разрешённой папке сервера или загрузите файлы.",
        });
        return true;
      }
      respondJson(response, 200, await service().start(input));
    } else if (match?.[2] === "update") {
      z.strictObject({}).parse(raw);
      if (
        !allowedAnalysisPaths(request, service().read(match[1]).roots, roots())
      ) {
        respondJson(response, 403, {
          error: "Папка больше не разрешена для чтения.",
        });
        return true;
      }
      respondJson(response, 200, await service().update(match[1]));
    } else if (match?.[2] === "cancel") {
      z.strictObject({}).parse(raw);
      service().cancel(match[1]);
      respondJson(response, 200, service().read(match[1]));
    } else if (match?.[2] === "accept") {
      const input = z
        .strictObject({ selected: z.array(z.string()).max(1000) })
        .parse(raw);
      respondJson(
        response,
        200,
        await service().accept(match[1], input.selected),
      );
    } else respondJson(response, 404, { error: "Операция не найдена." });
  } catch (error) {
    respondJson(response, error instanceof RevisionConflict ? 409 : 400, {
      error:
        error instanceof z.ZodError || error instanceof InvalidBody
          ? "Проверьте выбранные файлы и параметры анализа."
          : error instanceof Error
            ? error.message
            : "Не удалось выполнить анализ.",
    });
  }
  return true;
}
