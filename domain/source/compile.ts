import type { SourceDocument } from "./contracts.ts";
import type { Note } from "#domain/knowledge/material.ts";
import type { PreparedQuestion } from "#domain/knowledge/question.ts";
import {
  extractQuestions,
  categoryFor,
  headings,
} from "#domain/knowledge/markdown.ts";
import { sourceMetadata } from "./metadata.ts";
import { assignQuestionIdentities } from "./question-identity.ts";
import { sourceDocumentSchema } from "./contracts.ts";

export interface CompiledSourceDocument {
  document: SourceDocument;
  note?: Note;
  questions: PreparedQuestion[];
  warnings: string[];
}
export function compileSourceDocument(
  input: SourceDocument,
  previous: SourceDocument | undefined,
  makeId: () => string,
  matches: Record<string, string> = {},
): CompiledSourceDocument {
  const document = sourceDocumentSchema.parse(input);
  if (
    previous &&
    (previous.id !== document.id || previous.sourceId !== document.sourceId)
  )
    throw new Error("Соответствие относится к другому материалу.");
  if (document.markdown === null)
    return { document, questions: [], warnings: [] };
  if ((document.markdown.match(/^#{1,6}\s/gm) || []).length > 1000)
    throw new Error("В одном файле слишком много разделов.");
  const metadata = sourceMetadata(document.markdown, document.path);
  const note: Note = {
    id: document.id,
    sourceId: document.sourceId,
    path: document.path,
    title: metadata.title,
    markdown: document.markdown,
    category: metadata.category || categoryFor(document.path),
    aliases: [...new Set([...document.aliases, ...metadata.aliases])],
    ...(document.profile !== "shared" ? { profiles: [document.profile] } : {}),
  };
  const currentHeadings = headingInventory(document.markdown),
    priorHeadings = headingInventory(previous?.markdown || "");
  const oldMatches = new Set<string>();
  for (const [current, old] of Object.entries(matches)) {
    if (
      !currentHeadings.has(current) ||
      !priorHeadings.has(old) ||
      oldMatches.has(old)
    )
      throw new Error("Проверьте соответствие разделов прежнему материалу.");
    oldMatches.add(old);
  }
  const parsed =
    document.kind === "reference" ? [] : extractQuestions(note, document.kind);
  const oldParsed =
    !previous?.markdown || previous.kind === "reference"
      ? []
      : extractQuestions(
          { id: previous.id, path: previous.path, markdown: previous.markdown },
          previous.kind,
        );
  const assigned = assignQuestionIdentities(
    parsed,
    oldParsed,
    document.questionKeys,
    document.sourceId,
    makeId,
    matches,
  );
  const aliases = new Map(Object.entries(document.headingAliases || {}));
  const pairs = new Map<string, string>(
    Object.entries(matches).map(([current, old]) => [old, current]),
  );
  for (const old of oldParsed) {
    const id = Object.hasOwn(document.questionKeys, old.heading || old.title)
      ? document.questionKeys[old.heading || old.title]
      : undefined;
    const current = assigned.questions.find((question) => question.id === id);
    if (current && old.heading !== current.heading)
      pairs.set(old.heading || old.title, current.heading || current.title);
  }
  for (const [old, current] of pairs) {
    for (const [alias, target] of aliases)
      if (target === old) aliases.set(alias, current);
    aliases.set(old, current);
    for (const key of priorHeadings.keys())
      if (
        key.startsWith(old + "#") &&
        currentHeadings.has(current + key.slice(old.length))
      )
        aliases.set(key, current + key.slice(old.length));
  }
  for (const key of currentHeadings.keys()) aliases.delete(key);
  const headingAliases = Object.fromEntries(aliases);
  const questions = assigned.questions.map((question) => ({
    ...question,
    source: "imported",
    category: metadata.category || question.category,
    ...(document.profile !== "shared" ? { profiles: [document.profile] } : {}),
  }));
  return {
    document: {
      ...document,
      questionKeys: assigned.questionKeys,
      headingAliases,
    },
    note: { ...note, headingAliases },
    questions,
    warnings: metadata.warnings,
  };
}

function headingInventory(markdown: string) {
  const entries = headings(markdown),
    counts = new Map<string, number>();
  for (const heading of entries)
    counts.set(heading.title, (counts.get(heading.title) || 0) + 1);
  return new Set(
    entries.map((heading) =>
      counts.get(heading.title)! > 1
        ? [...heading.parents.slice(1), heading.title].join("#")
        : heading.title,
    ),
  );
}
