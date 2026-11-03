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
  if (used.length >= (session.kind === "daily" ? 1 : 2)) return [];
  return (session.snapshots[id]?.followups || [])
    .map((text, index) => ({
      index,
      rank: hash(`${session.id}|${id}|${text}`),
    }))
    .filter(({ index }) => !used.includes(index))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ index }) => index);
}
export function openFollowup(session: Interview) {
  const index = availableFollowups(session)[0];
  if (index === undefined) return session;
  const next = structuredClone(session),
    id = next.questionIds[next.index];
  next.followupChoices = {
    ...next.followupChoices,
    [id]: [...usedFollowups(session), index],
  };
  next.followupIndex = index + 1;
  return next;
}
export function advanceQuestion(session: Interview, skip = false) {
  if (session.finished) return session;
  const next = structuredClone(session),
    id = next.questionIds[next.index];
  if (skip && !next.skipped.includes(id)) next.skipped.push(id);
  closeFollowup(next);
  next.index++;
  next.finished = next.index >= next.questionIds.length;
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
