import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import {
  loadPrivateKnowledge,
  loadRetainedBundledQuestions,
} from "#server/infrastructure/knowledge/private.ts";
import { readKnowledge } from "#server/application/knowledge.ts";
import { loadKnowledge } from "#server/infrastructure/knowledge/folder.ts";

test("retained question metadata is local, optional and rejects malformed or linked files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "retained-knowledge-"));
  try {
    const root = join(directory, "knowledge");
    mkdirSync(join(root, "Собеседования/Практика"), { recursive: true });
    writeFileSync(
      join(root, "Собеседования/Практика/JavaScript.md"),
      "# JavaScript\n\n## Пример\nУсловие.\n\n> [!answer]- Ответ\n> Полный ответ.\n\n**Критерии ответа:** Объяснить.",
    );
    const shared = loadKnowledge(root);
    const id = shared.questions[0].id;
    const metadata = join(root, "retained-bundled-questions.json");
    assert.deepEqual(loadRetainedBundledQuestions(root), []);
    writeFileSync(metadata, JSON.stringify([id]));
    for (const options of [
      { knowledgeRoot: root, projectPackageRoot: null },
      { knowledgeRoot: "", projectPackageRoot: directory },
    ]) {
      const bank = await readKnowledge({ ...options, common: () => shared });
      assert.equal(bank.questions.length, 2);
      assert.equal(bank.questions[1].id, `bundled-rounds:${id}`);
      assert.equal(bank.questions[1].interviewEligible, false);
    }
    for (const invalid of [
      "null",
      "{}",
      "[1]",
      '[""]',
      "invalid",
      JSON.stringify(Array(2001).fill(id)),
    ]) {
      writeFileSync(metadata, invalid);
      assert.throws(() => loadRetainedBundledQuestions(root));
    }
    rmSync(metadata);
    const external = join(directory, "external");
    mkdirSync(external);
    symlinkSync(external, metadata, "junction");
    assert.throws(() => loadRetainedBundledQuestions(root), /обычным файлом/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
