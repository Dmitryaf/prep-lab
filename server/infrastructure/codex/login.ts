import { createServer, type Server } from "node:http";
import { createRemoteJWKSet } from "jose";
import { CredentialStore } from "./credentials.ts";
import {
  authorize,
  consumeCallback,
  validateCredentials,
  issuer,
} from "./oauth.ts";
export class LoginManager {
  private readonly store: CredentialStore;
  private readonly request: typeof fetch;
  private server?: Server;
  private timer?: ReturnType<typeof setTimeout>;
  private outcome = "";
  constructor(store = new CredentialStore(), request: typeof fetch = fetch) {
    this.store = store;
    this.request = request;
  }
  status() {
    return { pending: !!this.server, message: this.outcome };
  }
  async begin() {
    if (this.server)
      throw new Error(
        "Вход уже ожидает завершения. Вернитесь к открытой ссылке или отмените попытку.",
      );
    const hostId = this.store.hostId();
    const current = this.store.read(),
      registration = this.store.registration();
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Не удалось открыть адрес возврата.");
    }
    const flow = authorize(
      hostId,
      address.port,
      current?.clientId || registration?.clientId,
    );
    this.server = server;
    this.outcome = "";
    const finish = (message: string) => {
      this.outcome = message;
      clearTimeout(this.timer);
      this.timer = undefined;
      this.server = undefined;
      server.close();
    };
    this.timer = setTimeout(
      () =>
        finish("Время ожидания входа истекло. Прежнее подключение сохранено."),
      10 * 60_000,
    );
    server.on("request", async (request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      if (
        request.method !== "GET" ||
        request.headers.host !== `127.0.0.1:${address.port}`
      ) {
        response.writeHead(400).end("Неверный запрос.");
        return;
      }
      const url = new URL(request.url || "/", flow.attempt.redirectUri);
      if (url.pathname !== "/auth/callback") {
        response.writeHead(404).end("Страница не найдена.");
        return;
      }
      try {
        const form = consumeCallback(url, flow.attempt);
        const result = await this.request(
          `${issuer}/api/accounts/oauth/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form,
            signal: AbortSignal.timeout(30_000),
            redirect: "error",
          },
        );
        if (!result.ok) throw new Error("Вход не завершён.");
        const verified = await validateCredentials(
          await result.json(),
          form.get("client_id")!,
          flow.attempt.nonce,
          createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
        );
        const subject = current?.subject || registration?.subject;
        if (subject && verified.subject !== subject)
          throw new Error("Пользователь регистрации не совпадает.");
        this.store.save({
          ...verified,
          hostId: this.store.hostId(),
          savedAt: new Date().toISOString(),
        });
        finish("ChatGPT подключён. Запросов к модели при входе не было.");
        response.end(
          "ChatGPT подключён к Prep Lab. Можно закрыть вкладку и вернуться в приложение.",
        );
      } catch {
        response
          .writeHead(400)
          .end(
            "Вход не завершён. Прежнее подключение сохранено. Вернитесь в Prep Lab.",
          );
        if (flow.attempt.consumed)
          finish(
            "Вход не завершён. Повторите вход; прежнее подключение сохранено.",
          );
      }
    });
    return {
      url: flow.url.toString(),
      expiresAt: new Date(flow.attempt.expiresAt).toISOString(),
    };
  }
  cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.server?.close();
    this.server = undefined;
    this.outcome = "Попытка входа отменена.";
  }
}
export const assistantLogin = new LoginManager();
