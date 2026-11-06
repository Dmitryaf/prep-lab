import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readKnowledge } from "#server/application/knowledge.ts";
import { loadKnowledge } from "#server/infrastructure/knowledge/folder.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { knowledgeForProfile } from "#domain/knowledge/profile.ts";
import { createSession } from "#domain/interview/selection.ts";
import { findMaterial } from "#domain/knowledge/lookup.ts";
import { resolveKnowledgeLink } from "#domain/knowledge/links.ts";
import { extractQuestions } from "#domain/knowledge/markdown.ts";
import { withBundledRounds } from "#domain/knowledge/bundled-rounds.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";

for (const mode of ["folder", "owner-package"] as const)
  test(`bundled rounds remain available with a legacy ${mode}, without replacing personal questions`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "frontend-round-catalog-"));
    try {
      const root = join(directory, "knowledge");
      const path = join(root, "Собеседования/Практика/Vue.md");
      mkdirSync(join(root, "Собеседования/Практика"), { recursive: true });
      const original =
        "# Vue\n\n## useFetch: реактивный адрес и состояния запроса\nЛичное условие.\n\n> [!answer]- Ответ\n> Личный ответ, который нельзя заменять.\n\n**Критерии ответа:** Личный критерий.";
      writeFileSync(path, original);
      const personal = loadKnowledge(root);
      const combined = await readKnowledge(
        mode === "folder"
          ? { knowledgeRoot: root, projectPackageRoot: null }
          : { knowledgeRoot: "", projectPackageRoot: directory },
      );
      for (const profile of ["vue", "react"] as const) {
        const bank = knowledgeForProfile(combined, profile);
        for (const format of ["coding", "review", "design"] as const) {
          const session = createSession(
            bank.questions,
            "full",
            {},
            profile,
            format,
          );
          assert.equal(
            session.questionIds.length,
            format === "design" ? 1 : format === "coding" ? 4 : 3,
            `${profile}/${format}`,
          );
          for (const question of Object.values(session.snapshots)) {
            assert.equal(question.roundFormat, format);
            assert(question.answer && question.criteria);
            assert(findMaterial(bank.notes, question.noteId!));
            for (const link of question.learningLinks || [])
              assert(findMaterial(bank.notes, link.noteId), link.noteId);
          }
        }
      }
      for (const question of personal.questions)
        assert.deepEqual(
          combined.questions.find((q) => q.id === question.id),
          question,
        );
      for (const note of personal.notes)
        assert.deepEqual(findMaterial(combined.notes, note.id), note);
      const bundledVue = combined.questions.find(
        (q) => q.roundFormat && q.category === "Vue",
      )!;
      const ownNote = findMaterial(combined.notes, bundledVue.noteId!)!;
      assert.notEqual(ownNote.id, personal.notes[0].id);
      assert.equal(ownNote.sourceId, "bundled-rounds");
      assert.equal(
        resolveKnowledgeLink(
          "Собеседования/Практика/Vue.md",
          ownNote.id,
          (id, scope) => findMaterial(combined.notes, id, scope),
          (id) => id,
        ),
        ownNote.id,
      );
      assert.equal(
        new Set(combined.questions.map((q) => q.id)).size,
        combined.questions.length,
      );
      assert.equal(
        new Set(combined.notes.map((n) => n.id)).size,
        combined.notes.length,
      );
      assert.equal(readFileSync(path, "utf8"), original);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

test("a clean instance keeps its bundled IDs without adding duplicate rounds", async () => {
  const shared = loadCommonKnowledge();
  assert.deepEqual(
    await readKnowledge({ knowledgeRoot: "", projectPackageRoot: null }),
    shared,
  );
});

test("an explicit folder already containing the current rounds does not get duplicate tasks or lessons", async () => {
  const shared = loadCommonKnowledge();
  assert.deepEqual(
    await readKnowledge({
      knowledgeRoot: "content/common",
      projectPackageRoot: null,
    }),
    shared,
  );
});

function roundBank(markdown: string): Knowledge {
  const note = {
    id: "Собеседования/Практика/Задачи",
    path: "Собеседования/Практика/Задачи.md",
    title: "Задачи",
    category: "JavaScript",
    markdown,
  };
  return {
    notes: [note],
    questions: extractQuestions(note),
    route: [],
    warnings: [],
  };
}
const stage = (title: string, body: string, metadata = "", level = "##") =>
  `${level} ${title}\n${metadata}\n${body}\n\n> [!answer]- Ответ\n> Разбор: ${body}\n\n**Критерии ответа:** Проверка: ${body}`;

test("revised coding rounds use scoped current tasks and children while preserving authored personal text", () => {
  const personal = roundBank(
    [
      stage(
        "Поиск",
        "Личное прежнее условие поиска.",
        "**Формат раунда:** coding",
      ),
      stage("Страницы", "Личный разбор страниц.", "", "###"),
      stage("Кэш", "Личный алгоритм кэша.", "**Формат раунда:** coding"),
      stage(
        "Отдельная задача",
        "Не связанное с общими раундами личное условие.",
      ),
    ].join("\n\n"),
  );
  const shared = roundBank(
    [
      stage(
        "Поиск",
        "Текущее базовое условие поиска.",
        "**Формат раунда:** coding\n**Этап кода:** main",
      ),
      stage("Страницы", "Отдельный необязательный этап пагинации.", "", "###"),
      stage(
        "Кэш",
        "Расширенная алгоритмическая задача.",
        "**Формат раунда:** coding\n**Этап кода:** advanced",
      ),
      stage(
        "Сумма",
        "Вычислите сумму переданных значений.",
        "**Формат раунда:** coding\n**Этап кода:** short",
      ),
    ].join("\n\n"),
  );
  const before = structuredClone(personal);
  const combined = withBundledRounds(personal, shared);
  const original = before.questions[0];
  const preserved = combined.questions.find((q) => q.id === original.id)!;
  assert.equal(
    preserved.roundFormat,
    undefined,
    "superseded personal coding must not enter a second round",
  );
  assert.equal(
    preserved.codingRole,
    undefined,
    "do not relabel unmarked personal content as the new main",
  );
  assert.equal(preserved.prompt, original.prompt);
  assert.equal(preserved.answer, original.answer);
  assert.deepEqual(preserved.followupAnswers, original.followupAnswers);
  assert.equal(preserved.noteId, original.noteId);
  const advanced = combined.questions.find(
    (q) => q.title === "Кэш" && !q.id.startsWith("bundled-rounds:"),
  )!;
  assert.equal(
    advanced.codingRole,
    "advanced",
    "old counterparts must not bypass the advanced selection policy",
  );
  const current = combined.questions.find(
    (q) => q.id === `bundled-rounds:${original.id}`,
  )!;
  assert.equal(current.codingRole, "main");
  assert.equal(current.prompt, "Поиск\n\nТекущее базовое условие поиска.");
  assert.doesNotMatch(current.answer, /пагинации/);
  assert.match(
    current.followupAnswers![0].prompt!,
    /необязательный этап пагинации/,
  );
  const child = combined.questions.find(
    (q) => q.id === `bundled-rounds:${before.questions[1].id}`,
  )!;
  assert.equal(child.parentId, current.id);
  assert.equal(child.noteId, current.noteId);
  assert.equal(
    combined.questions.filter((q) => q.roundFormat === "coding").length,
    3,
  );
  assert.deepEqual(
    combined.questions.find((q) => q.id === before.questions[3].id),
    before.questions[3],
  );
  assert.deepEqual(combined.notes[0], before.notes[0]);
  assert.deepEqual(
    personal,
    before,
    "the input catalog and its original files are not migrated",
  );
});

test("matching current coding tasks are not duplicated, but changed optional contracts receive a scoped revision", () => {
  const markdown = [
    stage(
      "Поиск",
      "Базовый поиск по текстовому запросу.",
      "**Формат раунда:** coding\n**Этап кода:** main",
    ),
    stage("Страницы", "Покажите следующую страницу результатов.", "", "###"),
  ].join("\n\n");
  const current = roundBank(markdown);
  assert.deepEqual(
    withBundledRounds(current, current).questions,
    current.questions,
  );
  assert.deepEqual(withBundledRounds(current, current).notes, current.notes);
  const updated = roundBank(
    markdown.replace("Покажите следующую", "Загрузите предыдущую"),
  );
  const combined = withBundledRounds(current, updated);
  const scoped = combined.questions.find(
    (q) => q.id === `bundled-rounds:${current.questions[0].id}`,
  );
  assert(scoped, "a changed extension is part of the current round contract");
  assert.match(scoped.followupAnswers![0].prompt!, /предыдущую/);
});
