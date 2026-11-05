import type { Question } from "./question.ts";
import type { Note } from "./material.ts";
import { findMaterial } from "./lookup.ts";
import { resolveKnowledgeLink } from "./links.ts";

export function studyTopics(question: Question, notes: Note[]) {
  const topics: { noteId: string; heading: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const item of question.learningLinks || []) {
    if (item.kind !== "theory") continue;
    resolveKnowledgeLink(
      item.noteId + (item.heading ? "#" + item.heading : ""),
      question.noteId || "",
      (id, scope) => findMaterial(notes, id, scope),
      (noteId, heading) => {
        const key = noteId + "#" + heading;
        if (noteId !== question.noteId && !seen.has(key)) {
          seen.add(key);
          const note = findMaterial(notes, noteId)!;
          topics.push({
            noteId,
            heading,
            title: (heading.split("#").at(-1) || note.title).replace(
              /^\d+\.\s*/,
              "",
            ),
          });
        }
        return key;
      },
    );
  }
  return topics;
}
