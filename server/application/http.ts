import { createSpeechHandler } from "#server/infrastructure/speech/http.ts";
// Static app and read-only knowledge index. Corporate sources and preserved data are never served.
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep, extname } from "node:path";
import { readKnowledge } from "./knowledge.ts";
import { createStudyChat } from "#server/study-chat.ts";
import { workspaceId } from "#server/infrastructure/workspace.ts";
import { createLifecycle } from "#server/lifecycle.ts";
import type { StudyChatOptions } from "#server/types.ts";
import type { LifecycleOptions } from "#server/lifecycle.ts";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import { PreparationRepository } from "#server/infrastructure/storage/preparation.ts";
import { handlePreparation } from "#server/infrastructure/http/preparation.ts";
import { IntensiveRepository } from "#server/infrastructure/intensive/repository.ts";
import { IntensiveService } from "#server/application/intensive/service.ts";
import { handleIntensive } from "#server/infrastructure/intensive/http.ts";
import { DiscussionRepository } from "#server/infrastructure/storage/discussions.ts";
import { SettingsRepository } from "#server/infrastructure/storage/settings.ts";
import { SourceRepository } from "#server/infrastructure/storage/sources.ts";
import { sourceKnowledge } from "#domain/source/knowledge.ts";
import { handleSources } from "#server/infrastructure/http/sources.ts";
import { PromptRepository } from "#server/infrastructure/storage/prompts.ts";
import { handlePrompts } from "#server/infrastructure/http/prompts.ts";
import { readPromptTemplates } from "#server/infrastructure/prompts/templates.ts";
import { GenerationService } from "./generations.ts";
import { GenerationRepository } from "#server/infrastructure/storage/generations.ts";
import { ProjectRepository } from "#server/infrastructure/storage/reviewed-projects.ts";
import { SourceService } from "./sources.ts";
import { handleGenerations } from "#server/infrastructure/http/generations.ts";
import { answerWithCodex } from "#server/codex.ts";
import { AnalysisService } from "./analysis.ts";
import { AnalysisRepository } from "#server/infrastructure/storage/analyses.ts";
import { handleAnalysis } from "#server/infrastructure/http/analysis.ts";
import type { Answer } from "#server/types.ts";
import { discussionPrompt } from "./discussion-prompt.ts";
import { handleConnection } from "#server/infrastructure/http/connection.ts";
import { CredentialStore } from "#server/infrastructure/codex/credentials.ts";
import { handleSettings } from "#server/infrastructure/http/settings.ts";
import {
  readProjectCatalog,
  ownerPackagePath,
} from "#server/infrastructure/projects/catalog.ts";
export interface ServerOptions {
  credentialDirectory?: string;
  generationAnswer?: Answer;
  knowledgeRoot?: string;
  studyChatOptions?: StudyChatOptions;
  lifecycle?: LifecycleOptions;
  databasePath?: string;
  projectPackageRoot?: string | null;
  speech?: Parameters<typeof createSpeechHandler>[0];
}
const root = resolve(process.cwd(), ".output/public");
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
};
export function createHttpService({
  speech,
  credentialDirectory,
  generationAnswer = answerWithCodex,
  knowledgeRoot = process.env.CAREER_KNOWLEDGE_ROOT,
  studyChatOptions,
  lifecycle: lifecycleOptions,
  databasePath = ":memory:",
  projectPackageRoot = ownerPackagePath(),
}: ServerOptions = {}) {
  const handleSpeech = createSpeechHandler(speech);
  const database = openDatabase(databasePath);
  const history =
    studyChatOptions?.directory || studyChatOptions?.history
      ? undefined
      : new DiscussionRepository(database, resolve("artifacts/study-chats"));
  const chat = createStudyChat({
    preparePrompt: discussionPrompt(
      async () => readPromptTemplates(),
      () => prompts,
      () => settings.read().settings.profile,
    ),
    ...studyChatOptions,
    ...(history ? { history } : {}),
  });
  const preparation = new PreparationRepository(database);
  const settings = new SettingsRepository(database);
  const sources = new SourceRepository(database);
  const prompts = new PromptRepository(database);
  const reviewedProjects = new ProjectRepository(database);
  const analysisRepository = new AnalysisRepository(database);
  const intensive = new IntensiveService({
    repository: new IntensiveRepository(database),
    knowledge: async () =>
      analysisRepository.knowledge(
        sourceKnowledge(
          await readKnowledge({ knowledgeRoot, projectPackageRoot }),
          sources.snapshot().sources,
        ),
      ),
    projects: () =>
      reviewedProjects.catalog(readProjectCatalog(projectPackageRoot)),
  });
  const analyses = new AnalysisService({
    repository: analysisRepository,
    knowledge: async () =>
      analysisRepository.knowledge(
        sourceKnowledge(
          await readKnowledge({ knowledgeRoot, projectPackageRoot }),
          sources.snapshot().sources,
        ),
      ),
    answer: generationAnswer,
  });
  const generations = new GenerationService({
    repository: new GenerationRepository(database),
    projects: reviewedProjects,
    prompts,
    templates: async () => readPromptTemplates(),
    sources: new SourceService(sources, () =>
      readKnowledge({ knowledgeRoot, projectPackageRoot }),
    ),
    answer: generationAnswer,
  });
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
    if (await handleIntensive(req, res, intensive)) return;
    if (await handleSettings(req, res, settings)) return;
    if (
      await handleAnalysis(req, res, analyses, () =>
        sources.roots().map((root) => root.path),
      )
    )
      return;
    if (
      await handleSources(req, res, sources, () =>
        readKnowledge({ knowledgeRoot, projectPackageRoot }),
      )
    )
      return;
    if (await handlePrompts(req, res, prompts, readPromptTemplates)) return;
    if (
      await handleConnection(
        req,
        res,
        credentialDirectory
          ? { store: new CredentialStore(credentialDirectory) }
          : {},
      )
    )
      return;
    if (
      await handleGenerations(req, res, generations, () =>
        reviewedProjects.revision(),
      )
    )
      return;
    if (await handleSpeech(req, res)) return;
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
          body = analysisRepository.knowledge(
            sourceKnowledge(
              await readKnowledge({ knowledgeRoot, projectPackageRoot }),
              sources.snapshot().sources,
            ),
          );
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
          const catalog = reviewedProjects.catalog(
            readProjectCatalog(projectPackageRoot),
          );
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
        "Content-Security-Policy": `default-src 'self'; script-src 'self' ${scriptHashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'`,
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
      await generations.close();
      await analyses.close();
      if (database.open) database.close();
    },
  };
}
