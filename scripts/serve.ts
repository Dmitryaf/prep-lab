import http from "node:http";
import {
  createHttpService,
  type ServerOptions,
} from "#server/application/http.ts";
export type { ServerOptions };
// Compatibility host for the existing isolated HTTP/browser fixtures.
export function createServer(options: ServerOptions = {}) {
  const service = createHttpService(options);
  const server = http.createServer(service.handle);
  server.once("listening", () => service.start());
  server.on("close", () => {
    void service.close();
  });
  return Object.assign(server, { closeStudyChat: () => service.close() });
}
