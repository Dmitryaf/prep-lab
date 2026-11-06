import { test as baseTest, expect } from "@playwright/test";
import { createServer } from "#scripts/serve.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type App = { server: ReturnType<typeof createServer>; base: string };
export const test = baseTest.extend<{
  app: App;
  pageErrors: string[];
  appOptions: Parameters<typeof createServer>[0];
}>({
  appOptions: [{}, { option: true }],
  app: async ({ appOptions }, use) => {
    const directory = await mkdtemp(join(tmpdir(), "frontend-lab-browser-"));
    const server = createServer({
      ...appOptions,
      credentialDirectory: join(directory, "assistant"),
      studyChatOptions: {
        directory,
        answer: async () => {
          throw Error("В этом сценарии ответ модели не настроен.");
        },
        ...appOptions?.studyChatOptions,
      },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw Error("Не удалось получить адрес тестового сервера");
      await use({ server, base: `http://127.0.0.1:${address.port}` });
    } finally {
      await server.closeStudyChat();
      server.closeAllConnections();
      if (server.listening)
        await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  },
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
