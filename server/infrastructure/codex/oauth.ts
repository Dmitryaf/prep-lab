import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
export const issuer = "https://auth.openai.com";
export const resource = "https://api.openai.com/v1";
export const scope =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const clientIdSchema = z.string().regex(/^oaiapp_[a-zA-Z0-9_-]+$/);
export interface LoginAttempt {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  expiresAt: number;
  consumed: boolean;
  clientId?: string;
}
export function authorize(
  hostId: string,
  port: number,
  savedClientId?: string,
  now = Date.now(),
) {
  if (!/^urn:uuid:/i.test(hostId)) throw new Error("Неверный ID экземпляра.");
  z.uuidv4().parse(hostId.slice(9));
  z.number().int().min(1024).max(65535).parse(port);
  if (savedClientId) clientIdSchema.parse(savedClientId);
  const verifier = randomBytes(64).toString("base64url");
  const attempt: LoginAttempt = {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier,
    redirectUri: `http://127.0.0.1:${port}/auth/callback`,
    expiresAt: now + 10 * 60_000,
    consumed: false,
    clientId: savedClientId,
  };
  const url = new URL(`${issuer}/api/accounts/authorize`);
  url.search = new URLSearchParams({
    client_id: savedClientId || "dynamic_agent_client",
    ...(savedClientId ? {} : { agent_name_hint: "frontend_lab" }),
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: attempt.redirectUri,
    scope,
    resource,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString();
  return { url, attempt };
}
export function consumeCallback(
  url: URL,
  attempt: LoginAttempt,
  now = Date.now(),
) {
  const actual = Buffer.from(url.searchParams.get("state") || ""),
    expected = Buffer.from(attempt.state);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Состояние входа не совпадает.");
  if (attempt.consumed || now >= attempt.expiresAt)
    throw new Error("Попытка входа истекла или завершена.");
  if (url.origin + url.pathname !== attempt.redirectUri)
    throw new Error("Неверный адрес возврата.");
  attempt.consumed = true;
  if (url.searchParams.has("error"))
    throw new Error("Вход не разрешён пользователем или сервисом.");
  const callbackId = url.searchParams.get("client_id");
  const clientId = clientIdSchema.parse(callbackId || attempt.clientId);
  if (attempt.clientId && clientId !== attempt.clientId)
    throw new Error("Регистрация входа не совпадает.");
  const code = z.string().min(1).max(10000).parse(url.searchParams.get("code"));
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: attempt.verifier,
    redirect_uri: attempt.redirectUri,
    resource,
  });
}
export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  id_token: z.string().min(1),
  scope: z.string(),
  expires_in: z.number().positive(),
  token_type: z.string().optional(),
});
export function planScopes(value: string) {
  const scopes = value.trim().split(/\s+/);
  if (
    !scopes.includes("resource.invoke") ||
    !scopes.includes("chatgpt.tokens.use.direct")
  )
    throw new Error("Использование плана ChatGPT не разрешено.");
  return scopes;
}
export async function validateCredentials(
  raw: unknown,
  clientId: string,
  nonce: string,
  key: JWTVerifyGetKey,
) {
  clientIdSchema.parse(clientId);
  const tokens = tokenResponseSchema.parse(raw);
  const { payload } = await jwtVerify(tokens.id_token, key, {
    issuer,
    audience: clientId,
    requiredClaims: ["sub", "exp", "iat", "nonce"],
    clockTolerance: 5,
  });
  if (
    payload.nonce !== nonce ||
    typeof payload.sub !== "string" ||
    !payload.sub
  )
    throw new Error("Не удалось подтвердить пользователя входа.");
  return {
    clientId,
    subject: payload.sub,
    tokens,
    scopes: planScopes(tokens.scope),
  };
}
