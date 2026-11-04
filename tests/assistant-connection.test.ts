import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CredentialStore } from "../server/infrastructure/codex/credentials.ts";
import { LoginManager } from "../server/infrastructure/codex/login.ts";
import { handleConnection } from "../server/infrastructure/http/connection.ts";
import { signOut } from "../server/infrastructure/codex/sign-out.ts";

test("connection API exposes status only, requires same-origin JSON and never accepts RPC or paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lab-connection-api-"));
  const store = new CredentialStore(directory),
    login = new LoginManager(store);
  const server = createServer((request, response) => {
    void handleConnection(request, response, {
      store,
      login,
      active: () => false,
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, origin = base) =>
    fetch(base + "/api/connection" + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const state = await (await fetch(base + "/api/connection")).json();
    assert.equal(state.connected, false);
    assert.equal(state.active, false);
    assert(!JSON.stringify(state).includes(directory));
    assert.equal(
      (await post("/login", {}, "https://other.example")).status,
      403,
    );
    assert.equal(
      (await post("/refresh", { method: "turn/start", path: "/private" }))
        .status,
      400,
    );
    assert.equal((await post("/rpc", {})).status, 404);
  } finally {
    login.cancel();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("loopback login callback rejects wrong state before any token exchange", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lab-connection-login-"));
  let exchanges = 0;
  const login = new LoginManager(new CredentialStore(directory), async () => {
    exchanges++;
    throw new Error("No real OAuth in tests");
  });
  try {
    const started = await login.begin(),
      authorization = new URL(started.url),
      callback = new URL(authorization.searchParams.get("redirect_uri")!);
    callback.search = "?code=synthetic&state=wrong&client_id=oaiapp_test";
    assert.equal((await fetch(callback)).status, 400);
    assert.equal(exchanges, 0);
    assert.equal(login.status().pending, true);
  } finally {
    login.cancel();
    await rm(directory, { recursive: true, force: true });
  }
});

test("local sign-out clears tokens while retaining account registration and reports unconfirmed remote revocation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lab-connection-signout-"));
  try {
    const store = new CredentialStore(directory);
    store.save({
      clientId: "oaiapp_test",
      subject: "synthetic-user",
      tokens: {
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
        id_token: "synthetic-id",
        scope: "resource.invoke chatgpt.tokens.use.direct",
        expires_in: 3600,
      },
      scopes: ["resource.invoke", "chatgpt.tokens.use.direct"],
      hostId: store.hostId(),
      savedAt: new Date().toISOString(),
    });
    const host = store.hostId(),
      result = await signOut(store, async () => {
        throw new Error("network unavailable");
      });
    assert.equal(result.remoteRevocationConfirmed, false);
    assert.equal(store.status().connected, false);
    assert.equal(store.registration()?.clientId, "oaiapp_test");
    assert.equal(store.hostId(), host);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
