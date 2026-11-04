import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/infrastructure/storage/database.ts";
import { SourceRepository } from "../server/infrastructure/storage/sources.ts";
import { SourceService } from "../server/application/sources.ts";
import type { Knowledge } from "../domain/knowledge/material.ts";
const base: Knowledge = { notes: [], questions: [], route: [], warnings: [] };
const text = (answer: string) =>
  `# JavaScript\n## Порядок выполнения\n> [!answer]- Ответ\n> ${answer}\n`;
function setup() {
  const db = openDatabase(":memory:");
  const repository = new SourceRepository(db);
  return {
    db,
    repository,
    service: new SourceService(repository, async () => base),
  };
}
const file = (markdown = text("Ответ исходника."), path = "JavaScript.md") => ({
  path,
  markdown,
  kind: "theory" as const,
  profile: "shared" as const,
});

test("saved review corrections survive reopening and cannot overwrite an accepted preview", async () => {
  const { db, repository, service } = setup();
  try {
    const preview = await service.preview({
      name: "База",
      kind: "upload",
      documents: [file()],
    });
    const id = preview.entries[0].id;
    repository.saveDraft(preview.id, {
      revision: 0,
      resolutions: {
        [id]: { choice: "edited", markdown: text("Сохранённая правка.") },
      },
    });
    const restored = repository.preview(preview.id);
    assert.equal(restored.resolutions[id].choice, "edited");
    await service.accept(restored.id, {
      revision: 0,
      resolutions: restored.resolutions,
    });
    assert.match(
      service.knowledge(base).questions[0].answer,
      /Сохранённая правка/,
    );
    assert.throws(
      () => repository.saveDraft(preview.id, { revision: 1, resolutions: {} }),
      /принят|заверш|отклон/i,
    );
  } finally {
    db.close();
  }
});

test("preview is inactive, accepting publishes stable IDs and repeated acceptance never reapplies", async () => {
  const { db, repository, service } = setup();
  try {
    const preview = await service.preview({
      name: "Моя база",
      kind: "upload",
      documents: [file()],
    });
    assert.equal(repository.snapshot().sources.length, 0);
    const accepted = await service.accept(preview.id, {
      revision: 0,
      resolutions: {},
    });
    assert.equal(accepted.revision, 1);
    const knowledge = service.knowledge(base);
    assert.equal(knowledge.questions.length, 1);
    assert.match(knowledge.questions[0].id, /\/question\//);
    assert.equal(
      (await service.accept(preview.id, { revision: 0, resolutions: {} }))
        .revision,
      1,
    );
    assert.equal(repository.snapshot().revision, 1);
  } finally {
    db.close();
  }
});

test("external updates preserve manual edits, expose conflicts and reject stale previews", async () => {
  const { db, repository, service } = setup();
  try {
    const first = await service.preview({
      name: "База",
      kind: "upload",
      documents: [file()],
    });
    await service.accept(first.id, { revision: 0, resolutions: {} });
    const original = service.knowledge(base).questions[0];
    const edit = await service.edit(
      first.source.id,
      original.noteId!,
      text("Моя правка."),
      1,
    );
    await service.accept(edit.id, { revision: 1, resolutions: {} });
    const update = await service.preview({
      sourceId: first.source.id,
      name: "База",
      kind: "upload",
      documents: [file(text("Новый внешний ответ."))],
    });
    assert.equal(update.entries[0].status, "conflict");
    await assert.rejects(
      service.accept(update.id, { revision: 2, resolutions: {} }),
      /конфликт/i,
    );
    const competing = await service.edit(
      first.source.id,
      original.noteId!,
      text("Ещё одна правка."),
      2,
    );
    await service.accept(competing.id, { revision: 2, resolutions: {} });
    await assert.rejects(
      service.accept(update.id, {
        revision: 2,
        resolutions: { [original.noteId!]: { choice: "incoming" } },
      }),
      /измен|верси|ревизи/i,
    );
    assert.equal(repository.snapshot().revision, 3);
    assert.equal(service.knowledge(base).questions[0].id, original.id);
    assert.match(service.knowledge(base).questions[0].answer, /Ещё одна/);
  } finally {
    db.close();
  }
});

test("invalid links and SQL write failures cannot publish any part of an import", async () => {
  const { db, repository, service } = setup();
  try {
    const invalid = await service.preview({
      name: "База",
      kind: "upload",
      documents: [file(text("Ответ.") + "\n[[Нет файла]]\n")],
    });
    await assert.rejects(
      service.accept(invalid.id, { revision: 0, resolutions: {} }),
      /ссыл/i,
    );
    const valid = await service.preview({
      name: "База",
      kind: "upload",
      documents: [file()],
    });
    db.exec(
      "CREATE TRIGGER fail_source_version BEFORE INSERT ON source_versions BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END",
    );
    await assert.rejects(
      service.accept(valid.id, { revision: 0, resolutions: {} }),
      /simulated disk failure/,
    );
    assert.equal(repository.snapshot().revision, 0);
    assert.equal(repository.snapshot().sources.length, 0);
    assert.equal(repository.preview(valid.id).status, "pending");
    assert.equal(
      db.prepare("SELECT count(*) FROM source_documents").pluck().get(),
      0,
    );
    db.exec("DROP TRIGGER fail_source_version");
    await service.accept(valid.id, { revision: 0, resolutions: {} });
    assert.equal(repository.snapshot().revision, 1);
  } finally {
    db.close();
  }
});

test("renaming a file preserves question and material IDs and historic links", async () => {
  const { db, service } = setup();
  try {
    const first = await service.preview({
      name: "База",
      kind: "upload",
      documents: [file()],
    });
    await service.accept(first.id, { revision: 0, resolutions: {} });
    const original = service.knowledge(base).questions[0];
    const next = await service.preview({
      sourceId: first.source.id,
      name: "База",
      kind: "upload",
      documents: [file(text("Ответ исходника."), "Новое имя.md")],
    });
    assert.equal(next.entries[0].status, "renamed");
    await service.accept(next.id, { revision: 1, resolutions: {} });
    const current = service.knowledge(base);
    assert.equal(current.questions[0].id, original.id);
    assert.equal(current.notes[0].id, original.noteId);
    assert.deepEqual(current.notes[0].aliases, ["JavaScript.md"]);
  } finally {
    db.close();
  }
});

test("an update cannot break an accepted link from another personal source", async () => {
  const { db, service } = setup();
  try {
    const keep = {
      ...file("# Справка\nТекст.", "Keep.md"),
      kind: "reference" as const,
    };
    const first = await service.preview({
      name: "Первая база",
      kind: "upload",
      documents: [file(), keep],
    });
    await service.accept(first.id, { revision: 0, resolutions: {} });
    const target = service.knowledge(base).questions[0].noteId!;
    const second = await service.preview({
      name: "Вторая база",
      kind: "upload",
      documents: [
        { ...file(`# Указатель\n[[${target}]]`, "Link.md"), kind: "reference" },
      ],
    });
    await service.accept(second.id, { revision: 1, resolutions: {} });
    const removal = await service.preview({
      sourceId: first.source.id,
      name: "Первая база",
      kind: "upload",
      documents: [keep],
    });
    await assert.rejects(
      service.accept(removal.id, { revision: 2, resolutions: {} }),
      /ссыл/i,
    );
    assert(service.knowledge(base).notes.some((note) => note.id === target));
  } finally {
    db.close();
  }
});
