import test from "node:test";
import assert from "node:assert/strict";
import { planSourceUpdate } from "#domain/source/update.ts";
import type { SourceDocument } from "#domain/source/contracts.ts";

const original: SourceDocument = {
  id: "source-a/material/old",
  sourceId: "source-a",
  path: "Прежнее имя.md",
  sourceMarkdown: "# Тема\nПринятый источник",
  markdown: "# Тема\nРучная правка",
  aliases: [],
  questionKeys: { Тема: "source-a/question/old" },
  kind: "theory",
  profile: "shared",
};
test("renaming a document retains its identity, question mapping and manual edit", () => {
  const plan = planSourceUpdate(
    "source-a",
    [original],
    [
      {
        path: "Новое имя.md",
        markdown: "# Тема\nПринятый источник",
        kind: "theory",
        profile: "shared",
      },
    ],
    () => "new-id",
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, "source-a/material/old");
  assert.equal(plan[0].status, "renamed");
  assert.equal(plan[0].proposed, "# Тема\nРучная правка");
  assert.deepEqual(plan[0].questionKeys, { Тема: "source-a/question/old" });
  assert.deepEqual(plan[0].aliases, ["Прежнее имя.md"]);
  assert.equal(original.path, "Прежнее имя.md");
});
test("duplicate headings are never treated as document identity", () => {
  const previous = [{ ...original, markdown: original.sourceMarkdown }];
  const plan = planSourceUpdate(
    "source-a",
    previous,
    [
      {
        path: "Другой файл.md",
        markdown: "# Тема\nДругой материал",
        kind: "theory",
        profile: "shared",
      },
    ],
    () => "new-id",
  );
  assert.equal(plan[0].id, "source-a/material/new-id");
  assert.equal(plan[0].status, "added");
  assert.equal(plan[1].id, "source-a/material/old");
  assert.equal(plan[1].status, "removed");
  assert.equal(plan[1].proposed, null);
});
test("an absent externally deleted file cannot discard a retained manual edit", () => {
  const plan = planSourceUpdate("source-a", [original], [], () => "unused");
  assert.equal(plan.length, 1);
  assert.equal(plan[0].status, "conflict");
  assert.equal(plan[0].incoming, null);
  assert.equal(plan[0].current, "# Тема\nРучная правка");
});
test("ambiguous identical documents are not automatically merged on rename", () => {
  const copies = [
    original,
    { ...original, id: "source-a/material/other", path: "Копия.md" },
  ];
  const plan = planSourceUpdate(
    "source-a",
    copies,
    [
      {
        path: "Новое.md",
        markdown: original.sourceMarkdown!,
        kind: "theory",
        profile: "shared",
      },
    ],
    () => "new-id",
  );
  assert.equal(plan[0].id, "source-a/material/new-id");
  assert.equal(plan[0].status, "added");
});
test("case-colliding input files and references from another source are rejected", () => {
  const first = {
    path: "Note.md",
    markdown: "Текст",
    kind: "theory" as const,
    profile: "shared" as const,
  };
  assert.throws(() =>
    planSourceUpdate(
      "source-a",
      [],
      [first, { ...first, path: "note.md" }],
      () => "unused",
    ),
  );
  assert.throws(() =>
    planSourceUpdate("source-b", [original], [first], () => "unused"),
  );
});
test("a newly copied file cannot steal the identity of a file still present in the source", () => {
  const plan = planSourceUpdate(
    "source-a",
    [original],
    [
      {
        path: "Копия.md",
        markdown: original.sourceMarkdown!,
        kind: "theory",
        profile: "shared",
      },
      {
        path: original.path,
        markdown: "# Тема\nИзменённый источник",
        kind: "theory",
        profile: "shared",
      },
    ],
    () => "new-id",
  );
  assert.equal(plan[0].id, "source-a/material/new-id");
  assert.equal(plan[1].id, "source-a/material/old");
  assert.equal(plan[1].status, "conflict");
});
test("an explicitly matched rename with changed content retains the old material and question IDs", () => {
  const plan = planSourceUpdate(
    "source-a",
    [original],
    [
      {
        path: "Переименованный.md",
        markdown: "# Новая тема\nНовая редакция",
        kind: "theory",
        profile: "shared",
      },
    ],
    () => "new-id",
    { "Переименованный.md": original.id },
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, original.id);
  assert.equal(plan[0].status, "conflict");
  assert.deepEqual(plan[0].questionKeys, { Тема: "source-a/question/old" });
});
test("explicit matches cannot target an unknown material or reuse one identity twice", () => {
  const first = {
    path: "Один.md",
    markdown: "Текст",
    kind: "theory" as const,
    profile: "shared" as const,
  };
  assert.throws(() =>
    planSourceUpdate("source-a", [original], [first], () => "unused", {
      "Один.md": "foreign-id",
    }),
  );
  assert.throws(() =>
    planSourceUpdate(
      "source-a",
      [original],
      [first, { ...first, path: "Два.md" }],
      () => "unused",
      { "Один.md": original.id, "Два.md": original.id },
    ),
  );
});
test("a changed classification appears as an update even when Markdown is unchanged", () => {
  const plan = planSourceUpdate(
    "source-a",
    [original],
    [
      {
        path: original.path,
        markdown: original.sourceMarkdown!,
        kind: "practice",
        profile: "react",
      },
    ],
    () => "unused",
  );
  assert.equal(plan[0].status, "updated");
  assert.equal(plan[0].proposed, original.markdown);
});
