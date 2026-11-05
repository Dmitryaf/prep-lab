import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Note } from "../domain/knowledge/material.ts";
import { libraryNotes } from "../domain/knowledge/library-navigation.ts";
import { findMaterial } from "../domain/knowledge/lookup.ts";
import { knowledgeForProfile } from "../domain/knowledge/profile.ts";

const labId = "Фронтенд/Практикумы/00. Карта раздела";
const oldText = readFileSync(
  new URL("./fixtures/legacy-lab-index.txt", import.meta.url),
  "utf8",
);
function note(id: string, title = "Практикумы", markdown = oldText): Note {
  return {
    id,
    title,
    markdown,
    path: id.replace(/^bundled-rounds\//, "") + ".md",
    category: "Инженерные вопросы",
    ...(id.startsWith("bundled-rounds/") ? { sourceId: "bundled-rounds" } : {}),
  };
}

test("library replaces only the known legacy lab index when its current scoped revision is available", () => {
  const legacy = note(
    labId,
    "Практикумы",
    "\uFEFF" + oldText.replace(/\n/g, "\r\n") + "\n",
  );
  const current = note(
    "bundled-rounds/" + labId,
    "Практикумы",
    "# Практикумы\n\nЗапускаемые стенды и упражнения.",
  );
  const input = [legacy, current];
  const before = structuredClone(input);
  const visible = libraryNotes(input);
  assert.deepEqual(
    visible.map((item) => item.id),
    [current.id],
  );
  assert.equal(visible[0].title, "Стенды и упражнения");
  assert.deepEqual(input, before);
  assert.equal(
    findMaterial(input, legacy.id),
    legacy,
    "historical direct URLs remain available",
  );
  assert.equal(
    findMaterial(input, labId, "bundled-rounds"),
    current,
    "scoped dependencies remain current",
  );
  assert.equal(
    libraryNotes([legacy])[0].id,
    legacy.id,
    "never hide the only available lab entry",
  );
});

test("library preserves modified and same-title materials instead of deduplicating by title", () => {
  const current = note("bundled-rounds/" + labId);
  const customized = note(
    labId,
    "Практикумы",
    oldText + "\n## Упражнения по моей программе\nДругие условия.",
  );
  const unrelated = note("Фронтенд/Практикумы/Мои упражнения");
  const visible = libraryNotes([customized, current, unrelated]);
  assert.deepEqual(
    visible.map((item) => item.id),
    [customized.id, current.id, unrelated.id],
  );
  assert.equal(visible[1].title, "Стенды и упражнения");
  assert.notEqual(visible[0].title, visible[1].title);
  assert.deepEqual(visible[2], unrelated);
});

test("library omits only known overview entries without hiding user notes with similar names", () => {
  const known = ["Фронтенд/00. Карта раздела", "Фронтенд/Внешние материалы"];
  const hidden = known.flatMap((id) => [
    note(id, "Фронтенд"),
    note("bundled-rounds/" + id, "Фронтенд"),
  ]);
  const custom = note("Фронтенд/Моя карта", "Фронтенд");
  const imported = {
    ...note("imported/custom-map", "Фронтенд"),
    path: "Фронтенд/00. Карта раздела.md",
    sourceId: "custom",
  };
  assert.deepEqual(libraryNotes([...hidden, custom, imported]), [
    custom,
    imported,
  ]);
  for (const item of hidden) assert.equal(findMaterial(hidden, item.id), item);
});

test("library recognizes the legacy index after the profile projection used by the browser", () => {
  const current = note(
    "bundled-rounds/" + labId,
    "Практикумы",
    "# Практикумы\n\nОткройте стенды для проверки поведения интерфейса и запросов.",
  );
  const original = [note(labId), current];
  for (const profile of ["vue", "react"] as const) {
    const catalog = knowledgeForProfile(
      { notes: original, questions: [], route: [], warnings: [] },
      profile,
    );
    assert.deepEqual(
      libraryNotes(catalog.notes, original).map((item) => item.id),
      [current.id],
    );
  }
});

test("both known common lab revisions yield to the current index, while changed text stays separate", () => {
  const current = note(
    "bundled-rounds/" + labId,
    "Практикумы",
    "# Практикумы\n\nОткройте стенды и выполните упражнения из README.",
  );
  for (const basename of [
    "legacy-lab-index",
    "legacy-downloadable-lab-index",
  ]) {
    const markdown = readFileSync(
      new URL(`./fixtures/${basename}.txt`, import.meta.url),
      "utf8",
    );
    const legacy = note(
      labId,
      "Практикумы",
      "\uFEFF" + markdown.replace(/\r?\n/g, "\r\n"),
    );
    assert.deepEqual(
      libraryNotes([legacy, current]).map((item) => item.id),
      [current.id],
      basename,
    );
    const customized = {
      ...legacy,
      markdown: legacy.markdown.replace("примеры", "мои примеры"),
    };
    assert.notEqual(customized.markdown, legacy.markdown);
    assert.deepEqual(
      libraryNotes([customized, current]).map((item) => item.id),
      [customized.id, current.id],
      basename,
    );
  }
});
