import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  handleAnalysis,
  allowedAnalysisPaths,
} from "#server/infrastructure/http/analysis.ts";
import { AnalysisService } from "#server/application/analysis.ts";
import { AnalysisRepository } from "#server/infrastructure/storage/analyses.ts";
import { openDatabase } from "#server/infrastructure/storage/database.ts";

test("analysis HTTP requires explicit same-origin JSON and restricts remote filesystem roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lab-analysis-http-"));
  const previousOrigin = process.env.FRONTEND_LAB_ORIGIN;
  delete process.env.FRONTEND_LAB_ORIGIN;
  const db = openDatabase(":memory:");
  let calls = 0;
  const service = new AnalysisService({
    repository: new AnalysisRepository(db),
    knowledge: async () => ({
      notes: [],
      questions: [],
      route: [],
      warnings: [],
    }),
    answer: async () => {
      calls++;
      return JSON.stringify({ changes: [] });
    },
  });
  let allowed: string[] = [];
  const server = createServer((req, res) => {
    void handleAnalysis(req, res, service, () => allowed);
  });
  try {
    await writeFile(join(root, "Note.md"), "# Тема\nОписание");
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing server address");
    const origin = `http://127.0.0.1:${address.port}`,
      url = origin + "/api/analysis";
    const body = JSON.stringify({
      scenario: "import",
      profile: "vue",
      paths: [root],
      files: [],
      context: "",
    });
    const post = (headers: Record<string, string>, value = body) =>
      fetch(url, { method: "POST", headers, body: value });
    assert.equal(
      (await post({ "content-type": "application/json" })).status,
      403,
    );
    assert.equal(
      (
        await post({
          origin: "https://other.invalid",
          "content-type": "application/json",
        })
      ).status,
      403,
    );
    assert.equal(
      (await post({ origin, "content-type": "text/plain" })).status,
      415,
    );
    assert.equal(
      (await post({ origin, "content-type": "application/json" }, "{")).status,
      400,
    );
    assert.equal(calls, 0);
    const local = await post({ origin, "content-type": "application/json" });
    assert.equal(local.status, 200);
    await service.close();
    process.env.FRONTEND_LAB_ORIGIN = "https://lab.example";
    const remoteHeaders = {
      origin: "https://lab.example",
      "content-type": "application/json",
    };
    assert.equal((await post(remoteHeaders)).status, 403);
    allowed = [root];
    assert.equal((await post(remoteHeaders)).status, 200);
    await service.close();
    const escaped = JSON.stringify({
      scenario: "import",
      profile: "vue",
      paths: [join(root, "..")],
      files: [],
      context: "",
    });
    assert.equal((await post(remoteHeaders, escaped)).status, 403);
  } finally {
    await service.close();
    server.closeAllConnections();
    if (server.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    if (previousOrigin === undefined) delete process.env.FRONTEND_LAB_ORIGIN;
    else process.env.FRONTEND_LAB_ORIGIN = previousOrigin;
    await rm(root, { recursive: true, force: true });
  }
});

test("untrusted Host or remote address cannot grant arbitrary folder access", () => {
  const previousOrigin = process.env.FRONTEND_LAB_ORIGIN;
  delete process.env.FRONTEND_LAB_ORIGIN;
  const root = join(tmpdir(), "allowed-analysis");
  const req = (host: string, remoteAddress: string) =>
    ({ headers: { host }, socket: { remoteAddress } }) as IncomingMessage;
  try {
    assert.equal(
      allowedAnalysisPaths(req("evil.invalid", "127.0.0.1"), [root], []),
      false,
    );
    assert.equal(
      allowedAnalysisPaths(req("localhost:4173", "10.0.0.2"), [root], []),
      false,
    );
    assert.equal(
      allowedAnalysisPaths(req("localhost:4173", "127.0.0.1"), [root], []),
      true,
    );
    assert.equal(
      allowedAnalysisPaths(
        req("lab.example", "10.0.0.2"),
        [join(root, "notes")],
        [root],
      ),
      true,
    );
    assert.equal(
      allowedAnalysisPaths(
        req("lab.example", "10.0.0.2"),
        [root + "-other"],
        [root],
      ),
      false,
    );
  } finally {
    if (previousOrigin === undefined) delete process.env.FRONTEND_LAB_ORIGIN;
    else process.env.FRONTEND_LAB_ORIGIN = previousOrigin;
  }
});
