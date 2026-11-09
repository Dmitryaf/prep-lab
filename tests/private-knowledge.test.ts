import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { loadPrivateKnowledge } from "#server/infrastructure/knowledge/private.ts";
import { loadKnowledge } from "#server/infrastructure/knowledge/folder.ts";

test("common materials exclude the owner-only section", () => {
  assert(
    !loadCommonKnowledge().notes.some((note) =>
      note.path.startsWith("HR и самопрезентация/"),
    ),
  );
});

test("explicit private notes keep their paths and aliases without changing public folder loading", () => {
  const root = mkdtempSync(join(tmpdir(), "private-knowledge-"));
  try {
    mkdirSync(join(root, "Личные материалы"));
    const path = "Личные материалы/Разговор с рекрутером.md";
    writeFileSync(
      join(root, path),
      "# Мой материал\n\n## Мой вопрос\nЛичное пояснение.",
    );
    writeFileSync(
      join(root, "private-notes.json"),
      JSON.stringify([
        {
          path,
          title: "Мой материал",
          headingAliases: { "Прежний вопрос": "Мой вопрос" },
        },
      ]),
    );
    assert.equal(loadKnowledge(root).notes.length, 0);
    const note = loadPrivateKnowledge(root).notes[0];
    assert.equal(note.id, path.slice(0, -3));
    assert.equal(note.headingAliases?.["Прежний вопрос"], "Мой вопрос");
    writeFileSync(
      join(root, "private-notes.json"),
      JSON.stringify([{ path: "Личные материалы/Отсутствует.md" }]),
    );
    assert.throws(() => loadPrivateKnowledge(root));
    writeFileSync(
      join(root, "private-notes.json"),
      JSON.stringify([{ path: "../outside.md" }]),
    );
    assert.throws(() => loadPrivateKnowledge(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
