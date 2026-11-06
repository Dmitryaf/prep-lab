import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { CredentialStore } from "#server/infrastructure/codex/credentials.ts";
import { assistantRuntime } from "#server/infrastructure/codex/runtime.ts";
import { assistantLogin } from "#server/infrastructure/codex/login.ts";
import { refreshCredentials } from "#server/infrastructure/codex/refresh.ts";
import { signOut } from "#server/infrastructure/codex/sign-out.ts";
import { respondJson, readJsonBody, InvalidBody } from "./json.ts";
export async function handleConnection(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    store?: CredentialStore;
    login?: typeof assistantLogin;
    active?: () => boolean;
    refresh?: typeof refreshCredentials;
    disconnect?: typeof signOut;
  } = {},
) {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path !== "/api/connection" && !path.startsWith("/api/connection/"))
    return false;
  const store = options.store || new CredentialStore(),
    login = options.login || assistantLogin,
    active = options.active || (() => assistantRuntime.active);
  const localLoginAvailable = process.env.FRONTEND_LAB_LOCAL_LOGIN === "1";
  try {
    if (path === "/api/connection" && request.method === "GET") {
      respondJson(response, 200, {
        ...store.status(),
        ...login.status(),
        active: active(),
        localLoginAvailable,
      });
      return true;
    }
    if (request.method !== "POST") {
      respondJson(response, 405, { error: "Метод не поддерживается." });
      return true;
    }
    const expected =
      process.env.FRONTEND_LAB_ORIGIN || `http://${request.headers.host}`;
    if (request.headers.origin !== expected) {
      respondJson(response, 403, {
        error: "Запрос с этого адреса не разрешён.",
      });
      return true;
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      respondJson(response, 415, { error: "Ожидается JSON." });
      return true;
    }
    z.strictObject({}).parse(await readJsonBody(request, 1000));
    if (active()) {
      respondJson(response, 409, {
        error: "Сначала дождитесь ответа или отмените запрос к ChatGPT.",
      });
      return true;
    }
    if (path === "/api/connection/login") {
      const hostname = new URL(expected).hostname;
      if (
        !localLoginAvailable ||
        !["127.0.0.1", "localhost"].includes(hostname)
      ) {
        respondJson(response, 400, {
          error:
            "Вход на удалённом экземпляре выполняется локальным помощником с защищённым переносом подключения.",
        });
        return true;
      }
      respondJson(response, 200, await login.begin());
      return true;
    }
    if (path === "/api/connection/cancel-login") {
      login.cancel();
      respondJson(response, 200, { cancelled: true });
      return true;
    }
    if (path === "/api/connection/refresh") {
      await (options.refresh || refreshCredentials)(store, fetch, true);
      respondJson(response, 200, store.status());
      return true;
    }
    if (path === "/api/connection/disconnect") {
      login.cancel();
      respondJson(response, 200, await (options.disconnect || signOut)(store));
      return true;
    }
    respondJson(response, 404, { error: "Операция не найдена." });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof InvalidBody)
      respondJson(response, 400, {
        error: "Данные подключения не прошли проверку.",
      });
    else
      respondJson(response, 503, {
        error:
          "Не удалось обновить подключение ChatGPT. Секреты не передаются в браузер; проверьте настройки подключения.",
      });
  }
  return true;
}
