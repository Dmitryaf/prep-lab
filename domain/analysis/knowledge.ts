import type { Knowledge, Note } from "#domain/knowledge/material.ts";
import type { PreparedQuestion } from "#domain/knowledge/question.ts";
import { extractQuestions } from "#domain/knowledge/markdown.ts";
import { sourceMetadata } from "#domain/source/metadata.ts";
import type { AnalysisChange } from "./contracts.ts";

export interface KnowledgeOverlay {
  note: Note;
  questions: PreparedQuestion[];
  baseMarkdown?: string;
}
export function applyKnowledgeOverlays(
  base: Knowledge,
  overlays: KnowledgeOverlay[],
): Knowledge {
  const changed = new Set(overlays.map((item) => item.note.id));
  return {
    ...base,
    notes: [
      ...base.notes.filter((note) => !changed.has(note.id)),
      ...overlays.map((item) => item.note),
    ],
    questions: [
      ...base.questions.filter((q) => !changed.has(q.noteId || "")),
      ...overlays.flatMap((item) => item.questions),
    ],
  };
}
export function prepareKnowledgeOverlay(
  base: Knowledge,
  change: AnalysisChange,
): KnowledgeOverlay {
  const previous = change.targetId
    ? base.notes.find((note) => note.id === change.targetId)
    : undefined;
  if (change.targetId && !previous)
    throw new Error("Материал для обновления не найден.");
  if (previous && previous.markdown !== change.before)
    throw new Error(
      "Материал изменился после анализа. Запустите сравнение заново.",
    );
  const note: Note = previous
    ? { ...previous, markdown: change.after }
    : {
        id: `analysis:${change.id}`,
        path: `Дополнительные материалы/${change.title.replace(/[\\/:*?"<>|]/g, "-")}.md`,
        title: change.title,
        markdown: change.after,
        category: "Инженерные вопросы",
        sourceId: "analysis",
      };
  const oldQuestions = base.questions.filter((q) => q.noteId === note.id);
  const metadata = sourceMetadata(note.markdown, note.path);
  const previousKind = (
    ["theory", "practice", "design", "behavioral"] as const
  ).find((kind) => kind === oldQuestions[0]?.kind);
  const parsed =
    metadata.kind === "reference"
      ? []
      : extractQuestions(note, metadata.kind || previousKind || "theory");
  if (!previous && metadata.category) note.category = metadata.category;
  const key = (q: PreparedQuestion) => q.heading || q.title;
  for (const old of oldQuestions) {
    if (!parsed.some((q) => key(q) === key(old)))
      throw new Error(
        `В обновлении пропал вопрос «${old.title}». Сохраните прежние заголовки.`,
      );
  }
  const ids = new Map(
    parsed.map((q) => [
      q.id,
      oldQuestions.find((old) => key(old) === key(q))?.id || q.id,
    ]),
  );
  const questions = parsed.map((q) => {
    const old = oldQuestions.find((item) => key(item) === key(q));
    return {
      ...old,
      ...q,
      id: ids.get(q.id)!,
      category: old?.category || metadata.category || q.category,
      ...(old?.profiles
        ? { profiles: old.profiles }
        : note.profiles
          ? { profiles: note.profiles }
          : {}),
      ...(q.parentId ? { parentId: ids.get(q.parentId) || q.parentId } : {}),
    };
  });
  return {
    note,
    questions,
    ...(previous ? { baseMarkdown: previous.markdown } : {}),
  };
}
