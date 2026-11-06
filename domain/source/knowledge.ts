import { compileSourceDocument } from "./compile.ts";
import type { AcceptedSource } from "./preview.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";
import { findMaterial } from "#domain/knowledge/lookup.ts";
import { resolveKnowledgeLink } from "#domain/knowledge/links.ts";
import { renderMarkdown } from "#domain/knowledge/rendering.ts";

export function sourceKnowledge(base: Knowledge, sources: AcceptedSource[]) {
  const knowledge: Knowledge = {
    ...base,
    notes: [...base.notes],
    questions: [...base.questions],
    warnings: [...base.warnings],
  };
  for (const source of sources)
    for (const document of source.documents) {
      const compiled = compileSourceDocument(document, document, () => {
        throw new Error("Не сохранён ID вопроса.");
      });
      if (compiled.note) knowledge.notes.push(compiled.note);
      if (source.includeInterviews)
        knowledge.questions.push(...compiled.questions);
      knowledge.warnings.push(...compiled.warnings);
    }
  if (
    new Set(knowledge.notes.map((note) => note.id)).size !==
      knowledge.notes.length ||
    new Set(knowledge.questions.map((question) => question.id)).size !==
      knowledge.questions.length
  )
    throw new Error("Повторяются ID материалов или вопросов.");
  return knowledge;
}
export function validateSourceLinks(knowledge: Knowledge, sourceId?: string) {
  const errors: string[] = [];
  const lookup = (id: string, scope?: string) =>
    findMaterial(knowledge.notes, id, scope);
  for (const note of knowledge.notes.filter(
    (note) => !!note.sourceId && (!sourceId || note.sourceId === sourceId),
  )) {
    renderMarkdown(note.markdown, {
      resolveLink(raw) {
        const target = resolveKnowledgeLink(raw, note.id, lookup, (id) => id);
        if (!target && errors.length < 20) errors.push(`${note.path}: ${raw}`);
        return target;
      },
    });
  }
  return errors;
}
