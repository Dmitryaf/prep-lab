import { z } from "zod";
import { CredentialStore } from "./credentials.ts";
import { issuer } from "./oauth.ts";
export async function signOut(
  store: CredentialStore,
  request: typeof fetch = fetch,
) {
  const current = store.read();
  let confirmed = !current;
  if (current) {
    try {
      const metadata = await request(
        `${issuer}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(10000), redirect: "error" },
      );
      if (!metadata.ok) throw new Error("Metadata unavailable");
      const endpoint = new URL(
        z
          .object({ revocation_endpoint: z.string().url() })
          .parse(await metadata.json()).revocation_endpoint,
      );
      if (endpoint.origin !== issuer)
        throw new Error("Unexpected revocation endpoint");
      const revoked = await request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: current.tokens.refresh_token,
          token_type_hint: "refresh_token",
          client_id: current.clientId,
        }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      confirmed = revoked.status === 200;
    } catch {
      confirmed = false;
    }
  }
  store.disconnect();
  return {
    disconnected: true,
    remoteRevocationConfirmed: confirmed,
    message: confirmed
      ? "ChatGPT отключён."
      : "Подключение удалено с этого экземпляра. Отзыв сессии не подтверждён; при необходимости отключите приложение в настройках ChatGPT.",
  };
}
