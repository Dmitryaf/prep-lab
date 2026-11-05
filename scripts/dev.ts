import { loadNuxt, build } from "nuxt";
import { defineEventHandler } from "h3";
import type { Server } from "node:http";
import {
  createHttpService,
  type ServerOptions,
} from "../server/application/http.ts";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runtimeDatabasePath } from "../server/infrastructure/storage/runtime.ts";
import { packageLabs } from "./package-labs.ts";

export async function createDevelopmentServer({
  port = Number(process.env.PORT || 4173),
  ...options
}: ServerOptions & { port?: number } = {}) {
  await packageLabs();
  const api = createHttpService({
    ...options,
    databasePath: options.databasePath ?? runtimeDatabasePath(),
  });
  const nuxt = await loadNuxt({
    dev: true,
    cwd: resolve(import.meta.dirname, ".."),
    overrides: {
      dev: true,
      devServerHandlers: [
        {
          route: "/api",
          handler: defineEventHandler(async (event) => {
            const mountedUrl = event.node.req.url || "/";
            event.node.req.url = "/api" + mountedUrl;
            try {
              await api.handle(event.node.req, event.node.res);
            } finally {
              event.node.req.url = mountedUrl;
            }
          }),
        },
      ],
    },
  });
  let httpServer: Server | undefined;
  try {
    await build(nuxt);
    const listener: { server: Server; close: () => Promise<void> } =
      await nuxt.server.listen(port, {
        hostname: "127.0.0.1",
        showURL: false,
        open: false,
      });
    httpServer = listener.server;
    api.start();
    await nuxt.callHook("listen", listener.server, listener);
    let closing: Promise<void> | undefined;
    return {
      // Kept while launcher fixtures transition from the previous dev host.
      vite: {
        httpServer,
        printUrls: () =>
          console.log(
            `Frontend Lab: http://127.0.0.1:${(httpServer!.address() as { port: number }).port}/`,
          ),
      },
      api,
      close() {
        return (closing ??= (async () => {
          await api.close();
          httpServer?.closeAllConnections();
          await nuxt.close();
        })());
      },
    };
  } catch (error) {
    await api.close();
    httpServer?.closeAllConnections();
    await nuxt.close();
    throw error;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dev = await createDevelopmentServer();
  dev.vite.printUrls();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => dev.close());
}
