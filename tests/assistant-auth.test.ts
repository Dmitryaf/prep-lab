import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { mkdtemp, rm, readFile, stat, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  authorize,
  consumeCallback,
  validateCredentials,
} from "../server/infrastructure/codex/oauth.ts";
import { CredentialStore } from "../server/infrastructure/codex/credentials.ts";
import { refreshCredentials } from "../server/infrastructure/codex/refresh.ts";
import { importCredentials } from "../server/infrastructure/codex/cli.ts";

test("credential transfer verifies signed identity and keeps the target host without a token refresh", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lab-assistant-import-"));
  try {
    const pair = await generateKeyPair("RS256"),
      store = new CredentialStore(directory),
      target = store.hostId();
    const id = await new SignJWT({ sub: "synthetic-user" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://auth.openai.com")
      .setAudience("oaiapp_test")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(pair.privateKey);
    const value = {
      clientId: "oaiapp_test",
      subject: "synthetic-user",
      tokens: {
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
        id_token: id,
        scope: "resource.invoke chatgpt.tokens.use.direct",
        expires_in: 3600,
      },
      scopes: ["resource.invoke", "chatgpt.tokens.use.direct"],
      hostId: `urn:uuid:${randomUUID()}`,
      savedAt: new Date().toISOString(),
    };
    await importCredentials(
      store,
      JSON.stringify(value),
      async () => pair.publicKey,
    );
    assert.equal(store.read()!.hostId, target);
    assert.equal(store.read()!.tokens.access_token, "synthetic-access");
    const before = await readFile(join(directory, "credentials.json"), "utf8");
    await assert.rejects(
      importCredentials(
        store,
        JSON.stringify({ ...value, subject: "somebody-else" }),
        async () => pair.publicKey,
      ),
    );
    assert.equal(
      await readFile(join(directory, "credentials.json"), "utf8"),
      before,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("credential reads and initial directory creation reject ancestor junctions before touching their target", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lab-assistant-alias-"));
  try {
    const outside = join(directory, "outside");
    await mkdir(outside);
    const original = new CredentialStore(outside);
    original.hostId();
    await symlink(outside, join(directory, "alias"), "junction");
    const throughAlias = new CredentialStore(join(directory, "alias"));
    assert.throws(() => throughAlias.read(), /подключ|ссыл/i);
    assert.throws(
      () => new CredentialStore(join(directory, "alias/new-child")).hostId(),
      /ссыл/i,
    );
    await assert.rejects(stat(join(outside, "new-child")), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function callback(clientId?: string) {
  const flow = authorize(`urn:uuid:${randomUUID()}`, 1455, clientId);
  const url = new URL(flow.attempt.redirectUri);
  url.search = new URLSearchParams({
    state: flow.attempt.state,
    client_id: clientId || "oaiapp_test",
    code: "synthetic-code",
  }).toString();
  return { ...flow, callback: url };
}
test("SIWC registration separates PKCE, nonce and host identity, and reauthorization keeps the issued client", () => {
  const first = callback(),
    second = callback("oaiapp_saved");
  assert.equal(first.url.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(first.url.searchParams.get("agent_name_hint"), "frontend_lab");
  assert.equal(
    first.url.searchParams.get("code_challenge"),
    createHash("sha256").update(first.attempt.verifier).digest("base64url"),
  );
  assert(!first.url.searchParams.has("code_verifier"));
  assert.equal(second.url.searchParams.get("client_id"), "oaiapp_saved");
  assert(!second.url.searchParams.has("agent_name_hint"));
  second.callback.searchParams.delete("client_id");
  assert.equal(
    consumeCallback(second.callback, second.attempt).get("client_id"),
    "oaiapp_saved",
  );
  assert.throws(() => consumeCallback(second.callback, second.attempt));
  for (const mutate of [
    (url: URL) => url.searchParams.set("state", "wrong"),
    (url: URL) => {
      url.hostname = "localhost";
    },
    (url: URL) => url.searchParams.set("error", "access_denied"),
    (url: URL) => url.searchParams.set("client_id", "dynamic_agent_client"),
  ]) {
    const item = callback();
    mutate(item.callback);
    assert.throws(() => consumeCallback(item.callback, item.attempt));
  }
  const mismatch = callback("oaiapp_saved");
  mismatch.callback.searchParams.set("client_id", "oaiapp_other");
  assert.throws(() => consumeCallback(mismatch.callback, mismatch.attempt));
  const expired = callback();
  assert.throws(() =>
    consumeCallback(
      expired.callback,
      expired.attempt,
      expired.attempt.expiresAt,
    ),
  );
});
test("signed identity requires issuer, audience, nonce, expiry and plan scopes", async () => {
  const pair = await generateKeyPair("RS256"),
    other = await generateKeyPair("RS256");
  const id = await new SignJWT({ nonce: "nonce", sub: "synthetic-user" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://auth.openai.com")
    .setAudience("oaiapp_test")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pair.privateKey);
  const raw = {
    access_token: "synthetic-access",
    refresh_token: "synthetic-refresh",
    id_token: id,
    scope: "openid resource.invoke chatgpt.tokens.use.direct",
    expires_in: 300,
  };
  assert.equal(
    (
      await validateCredentials(
        raw,
        "oaiapp_test",
        "nonce",
        async () => pair.publicKey,
      )
    ).subject,
    "synthetic-user",
  );
  await assert.rejects(
    validateCredentials(
      raw,
      "oaiapp_other",
      "nonce",
      async () => pair.publicKey,
    ),
  );
  await assert.rejects(
    validateCredentials(
      raw,
      "oaiapp_test",
      "wrong",
      async () => pair.publicKey,
    ),
  );
  await assert.rejects(
    validateCredentials(
      raw,
      "oaiapp_test",
      "nonce",
      async () => other.publicKey,
    ),
  );
  await assert.rejects(
    validateCredentials(
      { ...raw, scope: "openid" },
      "oaiapp_test",
      "nonce",
      async () => pair.publicKey,
    ),
  );
});
test("atomic protected credential import preserves the target host and refresh rotates both tokens without inference", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lab-assistant-auth-"));
  try {
    const store = new CredentialStore(directory),
      hostId = store.hostId();
    const source = {
      clientId: "oaiapp_test",
      subject: "synthetic-user",
      tokens: {
        access_token: "old-access",
        refresh_token: "old-refresh",
        id_token: "retained-id",
        scope: "resource.invoke chatgpt.tokens.use.direct",
        expires_in: 1,
      },
      scopes: ["resource.invoke", "chatgpt.tokens.use.direct"],
      savedAt: new Date(0).toISOString(),
      hostId: `urn:uuid:${randomUUID()}`,
    };
    store.save(source);
    assert.equal(store.read()!.hostId, hostId);
    let calls = 0;
    const refreshed = await refreshCredentials(store, async (_url, options) => {
      calls++;
      assert.equal(
        new URLSearchParams(String(options?.body)).get("refresh_token"),
        "old-refresh",
      );
      return new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          scope: "resource.invoke chatgpt.tokens.use.direct",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200 },
      );
    });
    assert.equal(refreshed.tokens.access_token, "new-access");
    assert.equal(refreshed.tokens.refresh_token, "new-refresh");
    assert.equal(calls, 1);
    const bytes = await readFile(join(directory, "credentials.json"), "utf8");
    await assert.rejects(
      refreshCredentials(
        store,
        async () => new Response("denied", { status: 401 }),
        true,
      ),
    );
    assert.equal(
      await readFile(join(directory, "credentials.json"), "utf8"),
      bytes,
    );
    if (process.platform !== "win32")
      assert.equal(
        (await stat(join(directory, "credentials.json"))).mode & 0o077,
        0,
      );
    assert(!JSON.stringify(store.status()).includes("new-access"));
    assert(!JSON.stringify(store.status()).includes("synthetic-user"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
