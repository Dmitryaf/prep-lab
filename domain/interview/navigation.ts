import type { Interview } from "./state.ts";
import { hash } from "./deterministic.ts";
function usedFollowups(session: Interview) {
  const id = session.questionIds[session.index];
  // Legacy sessions stepped through the original list. Keep that position intact.
  return (
    session.followupChoices?.[id] ??
    Array.from({ length: session.followupIndex || 0 }, (_, i) => i)
  );
}
export function availableFollowups(session: Interview) {
  if (session.finished) return [];
  const id = session.questionIds[session.index],
    used = usedFollowups(session);
  const question = session.snapshots[id];
  const stagedCoding =
    question?.roundFormat === "coding" && question.codingRole;
  if (!stagedCoding && used.length >= (session.kind === "daily" ? 1 : 2))
    return [];
  return (session.snapshots[id]?.followups || [])
    .map((text, index) => ({
      index,
      rank:
        session.format && session.format !== "mixed"
          ? index
          : hash(`${session.id}|${id}|${text}`),
    }))
    .filter(({ index }) => !used.includes(index))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ index }) => index);
}
export function openFollowup(session: Interview, selectedIndex?: number) {
  const id = session.questionIds[session.index],
    question = session.snapshots[id];
  const selectable =
    question?.roundFormat === "coding" &&
    question.codingRole &&
    !session.finished;
  const index =
    selectedIndex === undefined
      ? availableFollowups(session)[0]
      : selectable &&
          Number.isInteger(selectedIndex) &&
          selectedIndex >= 0 &&
          selectedIndex < (question.followups?.length || 0)
        ? selectedIndex
        : undefined;
  if (index === undefined) return session;
  const next = structuredClone(session);
  next.followupChoices = {
    ...next.followupChoices,
    [id]: [...new Set([...usedFollowups(session), index])],
  };
  next.followupIndex = index + 1;
  return next;
}
export function advanceQuestion(session: Interview, skip = false) {
  if (session.finished) return session;
  const next = structuredClone(session),
    id = next.questionIds[next.index];
  const skippingExtension =
    next.followupIndex &&
    next.snapshots[id]?.roundFormat === "coding" &&
    next.snapshots[id]?.codingRole;
  if (skip && !skippingExtension && !next.skipped.includes(id))
    next.skipped.push(id);
  closeFollowup(next);
  next.index++;
  next.finished = next.index >= next.questionIds.length;
  return next;
}
export function finishInterview(session: Interview) {
  if (session.finished) return session;
  const next = structuredClone(session);
  closeFollowup(next);
  next.index = next.questionIds.length;
  next.finished = true;
  return next;
}
function closeFollowup(session: Interview) {
  const id = session.questionIds[session.index];
  if (session.followupIndex && !session.followupChoices?.[id])
    session.followupChoices = {
      ...session.followupChoices,
      [id]: usedFollowups(session),
    };
  session.followupIndex = 0;
}
export function previousQuestion(session: Interview) {
  if (session.finished || (!session.index && !session.followupIndex))
    return session;
  const next = structuredClone(session);
  closeFollowup(next);
  if (!session.followupIndex) next.index--;
  return next;
}
