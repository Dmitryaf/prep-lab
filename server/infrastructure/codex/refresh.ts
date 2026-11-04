import { z } from "zod";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { CredentialStore } from "./credentials.ts";
import { issuer, resource, planScopes } from "./oauth.ts";
const refreshedSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
  token_type: z.string().optional(),
});
const pending = new Map<
  string,
  Promise<import("./credentials.ts").Credentials>
>();
export function refreshCredentials(
  store: CredentialStore,
  request: typeof fetch = fetch,
  force = false,
) {
  const existing = pending.get(store.directory);
  if (existing) return existing;
  const operation = refreshOnce(store, request, force).finally(() =>
    pending.delete(store.directory),
  );
  pending.set(store.directory, operation);
  return operation;
}
async function refreshOnce(
  store: CredentialStore,
  request: typeof fetch,
  force: boolean,
) {
  const current = store.read();
  if (!current) throw new Error("Подключите ChatGPT к Frontend Lab.");
  if (
    !force &&
    Date.now() + 60_000 <
      Date.parse(current.savedAt) + current.tokens.expires_in * 1000
  )
    return current;
  const response = await request(`${issuer}/api/accounts/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: current.clientId,
      refresh_token: current.tokens.refresh_token,
      resource,
    }),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      "Сессия ChatGPT не обновлена. Выполните повторный вход; автоматического повтора запроса нет.",
    );
  const parsed = refreshedSchema.parse(await response.json());
  const tokens = {
    ...parsed,
    scope: parsed.scope ?? current.tokens.scope,
    refresh_token: parsed.refresh_token ?? current.tokens.refresh_token,
  };
  const scopes = planScopes(tokens.scope);
  if (tokens.id_token) {
    const { payload } = await jwtVerify(
      tokens.id_token,
      createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
      {
        issuer,
        audience: current.clientId,
        requiredClaims: ["sub", "exp", "iat"],
        clockTolerance: 5,
      },
    );
    if (payload.sub !== current.subject)
      throw new Error("Пользователь обновлённой сессии не совпадает.");
  }
  return store.save({
    ...current,
    tokens: { ...current.tokens, ...tokens },
    scopes,
    savedAt: new Date().toISOString(),
  });
}
