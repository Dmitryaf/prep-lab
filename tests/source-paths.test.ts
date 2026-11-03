import test from "node:test";
import assert from "node:assert/strict";
import { documentInputSchema } from "../domain/source/contracts.ts";

test("source entries cannot carry traversal, hidden instructions or executable files", () => {
  for (const path of [
    "../private.md",
    "/absolute.md",
    "a/../secret.md",
    "C:/secret.md",
    "\\\\server\\share\\a.md",
    "a\\b.md",
    ".git/notes.md",
    "a/.hidden.md",
    "AGENTS.md",
    "sub/AGENTS.override.md",
    "node_modules/lesson.md",
    "note.md.exe",
    "run.ts",
    "a\0.md",
    "a//note.md",
    "CON.md",
  ]) {
    assert.equal(
      documentInputSchema.safeParse({ path, markdown: "# Материал" }).success,
      false,
      path,
    );
  }
});
test("ordinary Unicode Obsidian paths and Markdown code remain data", () => {
  const input = {
    path: "Моя база/Асинхронность и Browser API.md",
    markdown:
      "# Материал\n\n```ts\nthrow new Error('данные, не команда');\n```",
  };
  const parsed = documentInputSchema.parse(input);
  assert.equal(parsed.path, input.path);
  assert.equal(parsed.markdown, input.markdown);
});
