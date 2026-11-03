// Static app and read-only knowledge index. Corporate sources and preserved data are never served.
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep, extname } from "node:path";
import { readKnowledge } from "./knowledge.ts";
import { createStudyChat } from "../study-chat.ts";
import { workspaceId } from "../infrastructure/workspace.ts";
import { createLifecycle } from "../lifecycle.ts";
import type { StudyChatOptions } from "../types.ts";
import type { LifecycleOptions } from "../lifecycle.ts";
import { openDatabase } from "../infrastructure/storage/database.ts";
import { PreparationRepository } from "../infrastructure/storage/preparation.ts";
import { handlePreparation } from "../infrastructure/http/preparation.ts";
import { DiscussionRepository } from "../infrastructure/storage/discussions.ts";
import { SettingsRepository } from "../infrastructure/storage/settings.ts";
import { handleSettings } from "../infrastructure/http/settings.ts";
import {
  readProjectCatalog,
  ownerPackagePath,
} from "../infrastructure/projects/catalog.ts";
export interface ServerOptions {
  knowledgeRoot?: string;
  studyChatOptions?: StudyChatOptions;
  lifecycle?: LifecycleOptions;
  databasePath?: string;
  projectPackageRoot?: string | null;
}
const root = resolve(process.cwd(), ".output/public");
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
export function createHttpService({
  knowledgeRoot = process.env.CAREER_KNOWLEDGE_ROOT,
  studyChatOptions,
  lifecycle: lifecycleOptions,
  databasePath = ":memory:",
  projectPackageRoot = ownerPackagePath(),
}: ServerOptions = {}) {
  const database = openDatabase(databasePath);
  const history =
    studyChatOptions?.directory || studyChatOptions?.history
      ? undefined
      : new DiscussionRepository(database, resolve("artifacts/study-chats"));
  const chat = createStudyChat({
    ...studyChatOptions,
    ...(history ? { history } : {}),
  });
  const preparation = new PreparationRepository(database);
  const settings = new SettingsRepository(database);
  let lifecycle: ReturnType<typeof createLifecycle> | null = null;
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const reject = (status: number) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(status === 404 ? "Страница не найдена" : "Запрос не разрешён");
    };
    const host = req.headers.host || "";
    if (
      !/^127\.0\.0\.1(?::\d+)?$/.test(host) &&
      !/^localhost(?::\d+)?$/.test(host)
    )
      return reject(403);
    if (req.headers.origin && req.headers.origin !== `http://${host}`)
      return reject(403);
    if (lifecycle?.handle(req, res)) return;
    if (req.url === "/api/lifecycle") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (await handlePreparation(req, res, preparation)) return;
    if (await handleSettings(req, res, settings)) return;
    if (await chat.handle(req, res)) return;
    if (req.method !== "GET" && req.method !== "HEAD") return reject(405);
    try {
      const pathname = decodeURIComponent(
        new URL(req.url || "/", "http://localhost").pathname,
      );
      if (
        pathname.includes("\\") ||
        pathname.includes("\0") ||
        pathname.split("/").some((p) => p.startsWith("."))
      )
        return reject(403);
      if (pathname === "/api/health") {
        lifecycle?.reserve();
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        return res.end(
          req.method === "HEAD"
            ? undefined
            : JSON.stringify({
                application: "projects-map",
                workspace: workspaceId,
                autoClose: !!lifecycle,
              }),
        );
      }
      if (pathname === "/api/knowledge") {
        let body;
        let status = 200;
        try {
          body = await readKnowledge({ knowledgeRoot, projectPackageRoot });
        } catch {
          status = 503;
          body = {
            error:
              "База знаний недоступна. Проверьте папку career-knowledge или настройку CAREER_KNOWLEDGE_ROOT. Карта проектов продолжает работать.",
          };
        }
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(
          req.method === "HEAD" ? undefined : JSON.stringify(body),
        );
      }
      if (pathname === "/api/projects") {
        try {
          const catalog = readProjectCatalog(projectPackageRoot);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          return res.end(
            req.method === "HEAD" ? undefined : JSON.stringify(catalog),
          );
        } catch {
          res.writeHead(503, {
            "Content-Type": "application/json; charset=utf-8",
          });
          return res.end(
            JSON.stringify({
              error: "Личные проекты недоступны. Исходный пакет сохранён.",
            }),
          );
        }
      }
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      if (!types[extname(relative)]) return reject(404);
      const path = realpathSync(resolve(root, relative));
      if (!path.startsWith(root + sep) || !statSync(path).isFile())
        return reject(404);
      const body = readFileSync(path);
      const scriptHashes =
        extname(path) === ".html"
          ? [
              ...body
                .toString("utf8")
                .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
            ]
              .filter((match) => match[1])
              .map(
                (match) =>
                  `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`,
              )
              .join(" ")
          : "";
      res.writeHead(200, {
        "Content-Type": types[extname(path)] + "; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'self'; script-src 'self' ${scriptHashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'`,
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      return reject(404);
    }
  };
  return {
    handle,
    start() {
      if (lifecycleOptions && !lifecycle)
        lifecycle = createLifecycle(lifecycleOptions);
    },
    close: async () => {
      lifecycle?.dispose();
      await chat.close();
      if (database.open) database.close();
    },
  };
}
