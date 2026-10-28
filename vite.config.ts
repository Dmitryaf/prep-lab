import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "private-workspace-boundary",
      configureServer(server) {
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
            /^\/(?:artifacts|lab|server|docs|\.git|\.agents|\.ai-rules)(?:\/|$)/i.test(
              path,
            ) ||
            path === "/AGENTS.md"
          ) {
            res.statusCode = 403;
            res.end("Доступ запрещён");
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    fs: {
      strict: true,
      allow: [fileURLToPath(new URL(".", import.meta.url))],
      deny: [
        "**/.env",
        "**/.env.*",
        "**/*.{crt,pem}",
        "**/.git/**",
        "**/artifacts/**",
        "**/lab/**",
        "**/.agents/**",
        "**/.ai-rules/**",
        "**/server/**",
        "**/docs/**",
        "**/AGENTS.md",
      ],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "trajectory-content",
              test: /[\\/]catalog[\\/]pilots[\\/]trajectory(?:-topics)?\.js$/,
            },
            {
              name: "inbox-content",
              test: /[\\/]catalog[\\/]pilots[\\/]inbox(?:-topics)?\.js$/,
            },
            {
              name: "commercial-content",
              test: /[\\/]catalog[\\/](?:commercial\.js|pilots[\\/](?:commercial-topics|medo)\.js)$/,
            },
          ],
        },
      },
    },
  },
});
