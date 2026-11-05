import type { Progress, Interview, AnswerAttempt } from "./state.ts";
import type { Rating, Mark } from "./rating.ts";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const storageKey = "project-map-platform-v3";
const empty = (): Progress => ({
  version: 3,
  progress: {},
  questionProgress: {},
  sessions: {},
  daily: {},
  activeSession: null,
});
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const safeKey = (k: string) =>
  !["__proto__", "constructor", "prototype"].includes(k);
function attempts(value: unknown): Record<string, AnswerAttempt> {
  if (!object(value)) throw Error("Некорректные самостоятельные ответы");
  const result: Record<string, AnswerAttempt> = {};
  for (const [id, attempt] of Object.entries(value)) {
    if (
      !safeKey(id) ||
      !object(attempt) ||
      typeof attempt.text !== "string" ||
      attempt.text.length > 20_000 ||
      typeof attempt.solutionUrl !== "string" ||
      attempt.solutionUrl.length > 2_000 ||
      typeof attempt.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(attempt.updatedAt))
    )
      throw Error("Некорректная самостоятельная попытка");
    if (attempt.solutionUrl) {
      let url: URL;
      try {
        url = new URL(attempt.solutionUrl);
      } catch {
        throw Error("Укажите полную ссылку на решение: https:// или http://");
      }
      if (!["https:", "http:"].includes(url.protocol))
        throw Error(
          "Ссылка на решение должна начинаться с https:// или http://",
        );
    }
    result[id] = {
      text: attempt.text,
      solutionUrl: attempt.solutionUrl,
      updatedAt: attempt.updatedAt,
    };
  }
  return result;
}
function marks(value: unknown): Record<string, Mark> {
  if (!object(value)) throw Error("Некорректные отметки");
  const out: Record<string, Mark> = {};
  for (const [id, raw] of Object.entries(value)) {
    const v = raw as Mark;
    if (
      !safeKey(id) ||
      !object(v) ||
      !["done", "again", "partial"].includes(v.status) ||
      (v.updatedAt !== undefined && typeof v.updatedAt !== "string")
    )
      throw Error("Некорректная отметка");
    out[id] = { status: v.status, updatedAt: v.updatedAt || "" };
  }
  return out;
}
function sessionMap(value: unknown): Record<string, Interview> {
  if (!object(value)) throw Error("Некорректные интервью");
  const result: Record<string, Interview> = {};
  for (const [key, raw] of Object.entries(value)) {
    const s = raw as Interview;
    if (
      !safeKey(key) ||
      !object(s) ||
      typeof s.id !== "string" ||
      !["daily", "full"].includes(s.kind) ||
      (s.profile !== undefined && !["vue", "react"].includes(s.profile)) ||
      (s.format !== undefined &&
        !["mixed", "coding", "review", "design"].includes(s.format)) ||
      typeof s.date !== "string" ||
      !Array.isArray(s.questionIds) ||
      new Set(s.questionIds).size !== s.questionIds.length ||
      !s.questionIds.every((id) => typeof id === "string" && safeKey(id)) ||
      !Number.isInteger(s.index) ||
      s.index < 0 ||
      s.index > s.questionIds.length ||
      typeof s.finished !== "boolean" ||
      !Array.isArray(s.skipped) ||
      !s.skipped.every((id) => s.questionIds.includes(id)) ||
      !object(s.ratings) ||
      !object(s.snapshots)
    )
      throw Error("Некорректное интервью");
    if (s.attempts !== undefined) {
      const saved = attempts(s.attempts);
      if (Object.keys(saved).some((id) => !s.questionIds.includes(id)))
        throw Error("Попытка относится к другому интервью");
    }
    for (const [id, rating] of Object.entries(s.ratings))
      if (
        !s.questionIds.includes(id) ||
        !["done", "partial", "again"].includes(rating)
      )
        throw Error("Некорректная оценка интервью");
    if (
      s.reviewed !== undefined &&
      (!Array.isArray(s.reviewed) ||
        s.reviewed.some((id) => !s.questionIds.includes(id)))
    )
      throw Error("Некорректные просмотренные ответы");
    if (s.followupChoices !== undefined) {
      if (!object(s.followupChoices))
        throw Error("Некорректный выбор уточнений");
      for (const [id, indices] of Object.entries(s.followupChoices))
        if (
          !s.questionIds.includes(id) ||
          !Array.isArray(indices) ||
          new Set(indices).size !== indices.length ||
          indices.some(
            (i) =>
              !Number.isInteger(i) ||
              i < 0 ||
              i >= (s.snapshots[id]?.followups?.length || 0),
          )
        )
          throw Error("Некорректный выбор уточнений");
    }
    for (const id of s.questionIds) {
      const q = s.snapshots[id];
      if (
        !object(q) ||
        q.id !== id ||
        typeof q.prompt !== "string" ||
        typeof q.answer !== "string" ||
        typeof q.title !== "string" ||
        (q.followups !== undefined &&
          (!Array.isArray(q.followups) ||
            !q.followups.every((f) => typeof f === "string"))) ||
        [
          "noteId",
          "heading",
          "topicId",
          "details",
          "shortAnswer",
          "category",
          "kind",
          "source",
        ].some((k) => q[k] !== undefined && typeof q[k] !== "string")
      )
        throw Error("Некорректный сохранённый вопрос");
    }
    if (
      Object.values(s.snapshots).some(
        (q) =>
          q.followupAnswers !== undefined &&
          (!Array.isArray(q.followupAnswers) ||
            q.followupAnswers.some(
              (f) =>
                !object(f) ||
                typeof f.title !== "string" ||
                typeof f.answer !== "string" ||
                (f.prompt !== undefined && typeof f.prompt !== "string") ||
                (f.criteria !== undefined && typeof f.criteria !== "string"),
            )),
      )
    )
      throw Error("Некорректные уточнения");
    for (const q of Object.values(s.snapshots)) {
      if (
        q.interviewEligible !== undefined &&
        typeof q.interviewEligible !== "boolean"
      )
        throw Error("Некорректный допуск к интервью");
      if (
        q.roundFormat !== undefined &&
        !["coding", "review", "design"].includes(q.roundFormat)
      )
        throw Error("Некорректный формат задания");
      if (q.criteria !== undefined && typeof q.criteria !== "string")
        throw Error("Некорректные критерии");
      if (
        q.codingRole !== undefined &&
        !["short", "main", "advanced"].includes(q.codingRole)
      )
        throw Error("Некорректный этап кода");
      if (
        q.curriculumTier !== undefined &&
        !["core", "extended", "vacancy"].includes(q.curriculumTier)
      )
        throw Error("Некорректный уровень маршрута");
      if (
        q.learningLinks !== undefined &&
        (!Array.isArray(q.learningLinks) ||
          q.learningLinks.some(
            (l) =>
              !object(l) ||
              !["theory", "practice"].includes(l.kind) ||
              ["noteId", "heading", "label"].some(
                (k) => typeof l[k] !== "string",
              ),
          ))
      )
        throw Error("Некорректные учебные ссылки");
    }
    if (
      !s.questionIds.length ||
      (!s.finished && s.index === s.questionIds.length) ||
      (s.followupIndex !== undefined &&
        (!Number.isInteger(s.followupIndex) ||
          s.followupIndex < 0 ||
          s.followupIndex >
            (s.snapshots[s.questionIds[s.index]]?.followups?.length || 0)))
    )
      throw Error("Некорректная позиция интервью");
    result[key] = structuredClone(s);
  }
  return result;
}
export function validateState(input: unknown): Progress {
  const value = input as Omit<Progress, "version"> & { version: number };
  if (!object(value) || ![1, 2, 3].includes(value.version))
    throw Error("Неизвестный формат прогресса");
  const s = empty();
  s.progress = marks(value.progress);
  s.questionProgress = value.version === 1 ? {} : marks(value.questionProgress);
  if (value.version === 3) {
    if (value.practiceAttempts !== undefined)
      s.practiceAttempts = attempts(value.practiceAttempts);
    s.sessions = sessionMap(value.sessions);
    s.daily = sessionMap(value.daily);
    if (
      Object.entries(s.daily).some(
        ([key, v]) =>
          key !== (v.profile === "react" ? `${v.date}:react` : v.date) ||
          v.kind !== "daily" ||
          v.id !== `daily:${key}`,
      ) ||
      Object.entries(s.sessions).some(
        ([key, v]) => key !== v.id || v.kind !== "full",
      )
    )
      throw Error("Некорректный каталог интервью");
    s.activeSession = value.activeSession;
    if (
      s.activeSession !== null &&
      (typeof s.activeSession !== "string" ||
        ![...Object.values(s.sessions), ...Object.values(s.daily)].some(
          (x) => x.id === s.activeSession,
        ))
    )
      throw Error("Не найдено активное интервью");
  }
  return s;
}
export function loadState(storage: Pick<StoragePort, "getItem">) {
  const raw = storage.getItem(storageKey);
  if (raw !== null) return validateState(JSON.parse(raw));
  const v2 = storage.getItem("project-map-review-v2");
  if (v2 !== null) return validateState(JSON.parse(v2));
  const v1 = storage.getItem("project-map-review-v1");
  return v1 === null
    ? empty()
    : validateState({ version: 1, progress: JSON.parse(v1) });
}
export function saveState(
  state: unknown,
  storage: Pick<StoragePort, "setItem">,
) {
  const next = validateState(state);
  storage.setItem(storageKey, JSON.stringify(next));
  return next;
}
export function exportState(state: unknown) {
  return JSON.stringify(validateState(state), null, 2);
}
export function importState(text: string, current: unknown) {
  if (text.length > 15_000_000) throw Error("Файл слишком большой");
  const incoming = validateState(JSON.parse(text));
  const base = validateState(current);
  return {
    ...base,
    ...(base.practiceAttempts || incoming.practiceAttempts
      ? {
          practiceAttempts: {
            ...base.practiceAttempts,
            ...incoming.practiceAttempts,
          },
        }
      : {}),
    progress: { ...base.progress, ...incoming.progress },
    questionProgress: {
      ...base.questionProgress,
      ...incoming.questionProgress,
    },
    sessions: { ...base.sessions, ...incoming.sessions },
    daily: { ...base.daily, ...incoming.daily },
    activeSession: incoming.activeSession || base.activeSession,
  };
}
export function rateQuestion(state: Progress, id: string, status: Rating) {
  if (!safeKey(id) || !["done", "partial", "again"].includes(status))
    throw Error("Некорректная отметка");
  return {
    ...state,
    questionProgress: {
      ...state.questionProgress,
      [id]: { status, updatedAt: new Date().toISOString() },
    },
  };
}
