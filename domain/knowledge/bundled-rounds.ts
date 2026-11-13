import type { Knowledge } from "./material.ts";
import { findMaterial } from "./lookup.ts";
import { resolveKnowledgeLink } from "./links.ts";
import { renderMarkdown } from "./rendering.ts";
import type { PreparedQuestion } from "./question.ts";

function codingContract(question: PreparedQuestion): string {
  return JSON.stringify({
    prompt: question.prompt,
    answer: question.answer,
    criteria: question.criteria,
    codingRole: question.codingRole,
    followups: question.followups,
    followupAnswers: question.followupAnswers,
  });
}

// Legacy folders keep their identities and authored answers. Missing built-in
// rounds and completed answers missing from old cards live in their own scope,
// including the materials used by their review.
export function withBundledRounds(
  personal: Knowledge,
  shared: Knowledge,
  retainedIds: readonly string[] = [],
): Knowledge {
  const existing = new Map(personal.questions.map((q) => [q.id, q]));
  const sharedQuestions = new Map(shared.questions.map((q) => [q.id, q]));
  const retired = new Set(
    shared.questions
      .filter((q) => q.interviewEligible === false)
      .map((q) => q.id),
  );
  const ready = shared.questions.filter(
    (q) =>
      q.answer.trim() &&
      q.criteria.trim() &&
      q.availableAnswer !== false &&
      q.interviewEligible !== false,
  );
  const rounds = ready.filter((q) => {
    if (!q.roundFormat) return false;
    const previous = existing.get(q.id);
    return (
      previous?.roundFormat !== q.roundFormat ||
      !previous.answer.trim() ||
      !previous.criteria.trim() ||
      previous.availableAnswer === false ||
      (q.roundFormat === "coding" &&
        codingContract(previous) !== codingContract(q))
    );
  });
  const revisedCoding = new Set(
    rounds.filter((q) => q.roundFormat === "coding").map((q) => q.id),
  );
  const advanced = new Set(
    ready.filter((q) => q.codingRole === "advanced").map((q) => q.id),
  );
  // Optional stages belong to the same shared revision as their parent, even
  // when a legacy folder already has an authored answer for that child ID.
  const roundIds = new Set(rounds.map((q) => q.id));
  let addedChild = true;
  while (addedChild) {
    addedChild = false;
    for (const question of ready) {
      if (
        question.parentId &&
        roundIds.has(question.parentId) &&
        !roundIds.has(question.id)
      ) {
        rounds.push(question);
        roundIds.add(question.id);
        addedChild = true;
      }
    }
  }
  const roundNotes = new Set(rounds.map((q) => q.noteId));
  // A new exercise in an already needed round note can accompany that note.
  // Other notes supplement only known unanswered IDs, never the entire bank.
  rounds.push(
    ...ready.filter(
      (q) =>
        !q.roundFormat &&
        !roundIds.has(q.id) &&
        !existing.get(q.id)?.answer.trim() &&
        (existing.has(q.id) || roundNotes.has(q.noteId)),
    ),
  );
  const activeIds = new Set(rounds.map((q) => q.id));
  const retainedOnly = new Set<string>();
  for (const id of new Set(retainedIds)) {
    const question = sharedQuestions.get(id);
    if (!question) throw new Error(`Сохранённый вопрос не найден: ${id}`);
    if (activeIds.has(id)) continue;
    // Historical links remain readable after a personal answer is completed.
    // These aliases must not duplicate that answer in a new interview.
    rounds.push(question);
    retainedOnly.add(id);
  }
  const bundledIds = new Set(rounds.map((q) => q.id));
  const scoped = (id: string) => `bundled-rounds/${id}`;
  const required = new Set(
    rounds.flatMap((q) => [
      q.noteId!,
      ...q.learningLinks.map((link) => link.noteId),
    ]),
  );
  const byId = new Map(shared.notes.map((note) => [note.id, note]));
  // Follow visible Markdown links too: opening a round's lesson must not jump
  // into a different personal revision or leave its linked lessons unavailable.
  for (const id of required) {
    const note = byId.get(id);
    if (!note) continue;
    renderMarkdown(note.markdown, {
      highlight: false,
      resolveLink: (raw) =>
        resolveKnowledgeLink(
          raw,
          id,
          (target, scope) => findMaterial(shared.notes, target, scope),
          (target) => {
            required.add(target);
            return target;
          },
        ),
    });
  }
  return {
    ...personal,
    profiles: shared.profiles,
    notes: [
      ...personal.notes,
      ...shared.notes
        .filter((note) => required.has(note.id))
        .map((note) => ({
          ...note,
          id: scoped(note.id),
          sourceId: "bundled-rounds",
        })),
    ],
    questions: [
      ...personal.questions.map((q) => {
        let current = q;
        const sharedQuestion = sharedQuestions.get(q.id);
        // Apply selection metadata only where the personal card still has the
        // named stages. Never replace its authored wording or stored sessions.
        if (
          q.interviewFollowups === undefined &&
          sharedQuestion?.interviewFollowups?.every((title) =>
            q.followups.includes(title),
          )
        )
          current = {
            ...current,
            interviewFollowups: [...sharedQuestion.interviewFollowups],
          };
        if (
          q.interviewDiagnostic === undefined &&
          sharedQuestion?.interviewDiagnostic
        )
          current = { ...current, interviewDiagnostic: true };
        if (retired.has(q.id))
          current = { ...current, interviewEligible: false };
        if (revisedCoding.has(q.id) && q.roundFormat === "coding") {
          current = { ...current };
          delete current.roundFormat;
        }
        if (advanced.has(q.id) && q.codingRole !== "advanced")
          current = { ...current, codingRole: "advanced" };
        return current;
      }),
      ...rounds.map((q) => ({
        ...q,
        ...(retainedOnly.has(q.id) ? { interviewEligible: false } : {}),
        id: `bundled-rounds:${q.id}`,
        ...(q.parentId && bundledIds.has(q.parentId)
          ? { parentId: `bundled-rounds:${q.parentId}` }
          : {}),
        noteId: q.noteId ? scoped(q.noteId) : undefined,
        curriculumTier: "extended" as const,
        learningLinks: q.learningLinks.map((link) => ({
          ...link,
          noteId: scoped(link.noteId),
        })),
      })),
    ],
  };
}
