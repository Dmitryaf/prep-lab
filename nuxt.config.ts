import { defineNuxtConfig } from "nuxt/config";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { imports: moduleImports } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { imports: Record<string, string> };

export default defineNuxtConfig({
  alias: Object.fromEntries(
    Object.entries(moduleImports).map(([name, target]) => [
      name.replace(/\/\*$/, ""),
      fileURLToPath(new URL(target.replace(/\/\*$/, ""), import.meta.url)),
    ]),
  ),
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  imports: { autoImport: false },
  modules: ["@pinia/nuxt"],
  css: [
    "~/shared/styles/base.css",
    "~/shared/styles/layout.css",
    "~/shared/styles/cards.css",
    "~/features/review-project/ui/projects.css",
    "~/entities/material/ui/materials.css",
    "~/shared/styles/responsive.css",
  ],
  app: {
    head: {
      title: "Prep Lab",
      htmlAttrs: { lang: "ru" },
      bodyAttrs: { class: "platform" },
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      ],
    },
  },
  nitro: {
    preset: "node-server",
    storage: { cache: { driver: "memory" } },
    prerender: { routes: ["/"] },
    externals: { external: ["better-sqlite3"] },
    serverAssets: [
      { baseName: "knowledge", dir: resolve("content/common") },
      { baseName: "prompts", dir: resolve("content/prompts") },
    ],
  },
  typescript: { strict: true },
  vite: {
    server: {
      fs: {
        strict: true,
        allow: [resolve(".")],
        deny: [
          "**/.env",
          "**/.env.*",
          "**/*.{crt,pem}",
          "**/.git/**",
          "**/artifacts/**",
          "**/.local/**",
          "**/lab/**",
          "**/.agents/**",
          "**/.codex/**",
          "**/server/**",
          "**/docs/**",
          "**/openspec/**",
          "**/AGENTS*.md",
        ],
      },
    },
  },
  hooks: {
    "vite:serverCreated"(server) {
      server.middlewares.use((req, res, next) => {
        let path: string;
        try {
          path = decodeURIComponent(
            new URL(req.url || "/", "http://localhost").pathname,
          );
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        if (
          /^\/(?:artifacts|lab|server|docs|openspec|\.git|\.agents|\.codex|\.local)(?:\/|$)/i.test(
            path,
          ) ||
          /^\/AGENTS.*\.md$/i.test(path)
        ) {
          res.statusCode = 403;
          res.end("Доступ запрещён");
          return;
        }
        next();
      });
    },
  },
});
