import test from "node:test";
import assert from "node:assert/strict";
import { sourceMetadata } from "#domain/source/metadata.ts";

test("Obsidian title and aliases are read without turning source metadata into instructions", () => {
  const result = sourceMetadata(
    "---\ntitle: Асинхронность\naliases: [Цикл событий, Event Loop]\nfrontendLab:\n  profile: vue\n  category: JavaScript\n---\n# Тема\nТекст.",
    "Заметки/Старая тема.md",
  );
  assert.equal(result.title, "Асинхронность");
  assert.deepEqual(result.aliases, ["Цикл событий", "Event Loop"]);
  assert.equal(result.profile, "vue");
  assert.equal(result.category, "JavaScript");
});
test("unsupported or malformed YAML stays visible as a warning and cannot supply executable metadata", () => {
  const result = sourceMetadata(
    "---\ntitle: !!js/function function() { throw new Error('do not execute'); }\n---\n# Безопасный заголовок\nМатериал.",
    "Тема.md",
  );
  assert.equal(result.title, "Безопасный заголовок");
  assert.deepEqual(result.aliases, []);
  assert.equal(result.warnings.length, 1);
});
test("plain Markdown uses its heading and preserves an ordinary reference document", () => {
  const result = sourceMetadata("# Контракт API\nТекст.", "Другое имя.md");
  assert.equal(result.title, "Контракт API");
  assert.deepEqual(result.aliases, []);
  assert.deepEqual(result.warnings, []);
});
