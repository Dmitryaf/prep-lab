import test from "node:test";
import assert from "node:assert/strict";
import { findMaterial } from "../domain/knowledge/lookup.ts";
import { resolveKnowledgeLink } from "../app/entities/material/lib/links.ts";
import type { Note } from "../domain/knowledge/material.ts";

const notes: Note[] = [
  {
    id: "m-003",
    sourceId: "source-b",
    path: "Docs/Second.md",
    title: "Чужой источник",
    markdown: "# Чужой\n## Новый\nТекст.",
    category: "JavaScript",
    aliases: ["Дополнение"],
  },
  {
    id: "m-001",
    sourceId: "source-a",
    path: "Docs/First.md",
    title: "Первый",
    markdown: "# Первый\nТекст.",
    category: "JavaScript",
  },
  {
    id: "m-002",
    sourceId: "source-a",
    path: "Docs/Second.md",
    title: "Второй",
    markdown: "# Второй\n## Новый\nСодержательный текст.",
    category: "JavaScript",
    aliases: ["Дополнение", "Docs/Previous.md"],
    headingAliases: { Прежний: "Новый" },
  },
];
const lookup = (id: string, scope?: string) => findMaterial(notes, id, scope);
const href = (id: string, heading: string) => `${id}#${heading}`;
test("a source-relative path cannot choose a same-named material from another source", () => {
  assert.equal(findMaterial(notes, "Docs/Second", "source-a")?.id, "m-002");
  assert.equal(findMaterial(notes, "Docs/Second", "source-b")?.id, "m-003");
  assert.equal(findMaterial(notes, "Docs/Second"), undefined);
});
test("relative Markdown links use the material path rather than its opaque stable ID", () => {
  assert.equal(
    resolveKnowledgeLink("Second.md#Новый", "m-001", lookup, href),
    "m-002#Новый",
  );
});
test("Obsidian aliases, renamed paths and old section anchors keep their target", () => {
  assert.equal(
    resolveKnowledgeLink("Дополнение#Прежний", "m-001", lookup, href),
    "m-002#Новый",
  );
  assert.equal(
    resolveKnowledgeLink("Docs/Previous.md#Прежний", "m-001", lookup, href),
    "m-002#Новый",
  );
  assert.equal(
    resolveKnowledgeLink("Second.md#Несуществующий", "m-001", lookup, href),
    null,
  );
  assert.equal(
    resolveKnowledgeLink("javascript:alert(1)", "m-001", lookup, href),
    null,
  );
});
