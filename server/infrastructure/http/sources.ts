import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { SourceService } from "../../application/sources.ts";
import { SourceRepository } from "../storage/sources.ts";
import { RevisionConflict } from "../storage/preparation.ts";
import { readJsonBody, InvalidBody, respondJson } from "./json.ts";
import { acceptSourceSchema } from "../../../domain/source/preview.ts";
import {
  uploadSchema,
  readMarkdownUploads,
  readMarkdownFolder,
} from "../sources/input.ts";
const previewInput = z.strictObject({
  sourceId: z.string().max(120).optional(),
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["upload", "folder"]),
  rootId: z.string().max(120).optional(),
  includeInterviews: z.boolean().default(true),
  files: z.array(uploadSchema).max(200).optional(),
  matches: z.record(z.string(), z.string()).optional(),
});
export async function handleSources(
  request: IncomingMessage,
  response: ServerResponse,
  source: SourceRepository | (() => SourceRepository),
  base: () => Promise<
    import("../../../domain/knowledge/material.ts").Knowledge
  >,
) {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path !== "/api/sources" && !path.startsWith("/api/sources/"))
    return false;
  try {
    const repository = typeof source === "function" ? source() : source;
    const service = new SourceService(repository, base);
    if (path === "/api/sources" && request.method === "GET") {
      respondJson(response, 200, {
        ...repository.snapshot(),
        roots: repository.roots().map(({ id, name }) => ({ id, name })),
        pending: repository.pending().map(({ id, source, createdAt }) => ({
          id,
          name: source.name,
          createdAt,
        })),
      });
      return true;
    }
    const match = /^\/api\/sources\/preview\/([a-f0-9-]+)$/.exec(path);
    if (match && request.method === "GET") {
      respondJson(response, 200, repository.preview(match[1]));
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
    const raw = await readJsonBody(request, 12_000_000);
    if (path === "/api/sources/preview") {
      const input = previewInput.parse(raw);
      let snapshot;
      if (input.kind === "folder") {
        const root = repository
          .roots()
          .find((root) => root.id === input.rootId);
        if (!root) throw new Error("Папка не разрешена владельцем сервера.");
        if (input.files)
          throw new Error("Для серверной папки файлы не передаются.");
        snapshot = await readMarkdownFolder(root.path);
      } else {
        if (input.rootId)
          throw new Error("Загрузка не может подключать серверную папку.");
        snapshot = await readMarkdownUploads(input.files || []);
      }
      const preview = await service.preview({
        ...input,
        documents: snapshot.documents,
      });
      respondJson(response, 200, { preview, skipped: snapshot.skipped });
      return true;
    }
    if (path === "/api/sources/rematch") {
      const input = z
        .strictObject({
          id: z.string().uuid(),
          matches: z.record(z.string(), z.string()),
        })
        .parse(raw);
      const prior = repository.preview(input.id);
      if (
        prior.status !== "pending" ||
        prior.revision !== repository.snapshot().revision
      )
        throw new RevisionConflict(
          "Материалы изменились. Подготовьте обновление заново.",
        );
      const preview = await service.preview({
        ...prior.source,
        sourceId: repository
          .snapshot()
          .sources.some((item) => item.id === prior.source.id)
          ? prior.source.id
          : undefined,
        documents: prior.entries
          .filter((entry) => entry.incoming !== null)
          .map((entry) => ({
            path: entry.path,
            markdown: entry.incoming!,
            kind: entry.kind,
            profile: entry.profile,
          })),
        matches: input.matches,
      });
      repository.discard(prior.id);
      respondJson(response, 200, preview);
      return true;
    }
    if (path === "/api/sources/edit") {
      const input = z
        .strictObject({
          sourceId: z.string().max(120),
          documentId: z.string().max(2048),
          markdown: z.string().max(1_000_000),
          revision: z.number().int().nonnegative(),
        })
        .parse(raw);
      respondJson(
        response,
        200,
        await service.edit(
          input.sourceId,
          input.documentId,
          input.markdown,
          input.revision,
        ),
      );
      return true;
    }
    if (path === "/api/sources/draft") {
      const { id, ...options } = acceptSourceSchema
        .extend({ id: z.string().uuid() })
        .parse(raw);
      respondJson(response, 200, repository.saveDraft(id, options));
      return true;
    }
    if (["/api/sources/accept", "/api/sources/inspect"].includes(path)) {
      const { id, ...options } = acceptSourceSchema
        .extend({ id: z.string().uuid() })
        .parse(raw);
      respondJson(
        response,
        200,
        path.endsWith("/accept")
          ? await service.accept(id, options)
          : await service.inspect(repository.preview(id), options),
      );
      return true;
    }
    if (path === "/api/sources/discard") {
      repository.discard(
        z.strictObject({ id: z.string().uuid() }).parse(raw).id,
      );
      respondJson(response, 200, { discarded: true });
      return true;
    }
    respondJson(response, 404, { error: "Операция не найдена." });
  } catch (error) {
    if (error instanceof RevisionConflict)
      respondJson(response, 409, { error: error.message });
    else if (error instanceof z.ZodError || error instanceof InvalidBody)
      respondJson(response, 400, {
        error:
          error instanceof InvalidBody
            ? error.message
            : "Данные импорта не прошли проверку.",
      });
    else if (error instanceof Error && !("code" in error))
      respondJson(response, 400, { error: error.message });
    else
      respondJson(response, 503, {
        error:
          "Не удалось прочитать или сохранить источник. Принятые материалы сохранены.",
      });
  }
  return true;
}
