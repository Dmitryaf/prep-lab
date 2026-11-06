import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";

test("Node resolves application aliases without a TypeScript loader", async () => {
  const { projectQuestions } =
    await import("#ui/entities/project/model/questions.ts");
  const { projectFixture } = await import("#tests/fixtures/projects.ts");
  const { canonicalNotePath } = await import("#domain/knowledge/path.ts");
  const { openDatabase } =
    await import("#server/infrastructure/storage/database.ts");
  const { createServer } = await import("#scripts/serve.ts");
  const fixture = projectFixture();
  assert.equal(projectQuestions(fixture.topics).length, 18);
  assert.equal(canonicalNotePath("Example.md"), "Example");
  assert.equal(typeof createServer, "function");
  const db = openDatabase(":memory:");
  db.close();
});

test("aliases preserve architectural boundaries and reject deep relative imports", async () => {
  const eslint = new ESLint();
  for (const [filePath, specifier] of [
    ["domain/alias-check.ts", "#ui/entities/project/model/questions.ts"],
    ["domain/alias-check.ts", "#server/application/http.ts"],
    ["app/entities/project/alias-check.ts", "#server/application/http.ts"],
    [
      "app/entities/project/alias-check.ts",
      "#ui/features/review-project/model/store.ts",
    ],
    [
      "app/features/review-project/alias-check.ts",
      "#server/application/http.ts",
    ],
    [
      "app/features/review-project/alias-check.ts",
      "#ui/features/study-discussion/model/store.ts",
    ],
    ["app/pages/alias-check.ts", "../../domain/knowledge/path.ts"],
  ]) {
    const [result] = await eslint.lintText(`import "${specifier}";`, {
      filePath,
    });
    assert(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
      `${filePath}: ${specifier}`,
    );
  }
  for (const specifier of [
    "#domain/knowledge/path.ts",
    "#ui/features/study-discussion/index.ts",
    "./local.ts",
  ]) {
    const [result] = await eslint.lintText(`import "${specifier}";`, {
      filePath: "app/features/review-project/alias-check.ts",
    });
    assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
  }
});
