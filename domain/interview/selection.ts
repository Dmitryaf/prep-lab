import type { Progress, Interview } from "./state.ts";
import type { Question } from "#domain/knowledge/question.ts";
import { isTestingTask } from "#domain/knowledge/question.ts";
import type { Mark } from "./rating.ts";
import { hash } from "./deterministic.ts";
import {
  supportsQuestion,
  type StackProfile,
} from "#domain/knowledge/profile.ts";
import type { InterviewFormat } from "./formats.ts";
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function selectInterview(
  questions: Question[],
  kind: Interview["kind"],
  date: string,
  history: Pick<Interview, "questionIds">[] = [],
  _progress: Record<string, Mark> = {},
  profile: StackProfile = "vue",
  format: InterviewFormat = "mixed",
) {
  const hasCurriculum = questions.some((q) => q.curriculumTier === "core");
  const eligible = questions.filter(
    (q) =>
      ((kind === "full" &&
        (format !== "mixed" ||
          (q.kind === "design" &&
            q.roundFormat === "design" &&
            q.answer.trim() &&
            q.criteria?.trim()))) ||
        q.source === "projects" ||
        !hasCurriculum ||
        q.curriculumTier === "core") &&
      q.availableAnswer !== false &&
      q.interviewEligible !== false &&
      !isTestingTask(q) &&
      q.codingRole !== "advanced" &&
      !q.parentId &&
      supportsQuestion(q, profile),
  );
  const categoryOf = (q: Question) =>
    ["Тестирование", "Инженерные вопросы"].includes(q.category)
      ? "Архитектура, производительность и тестирование"
      : q.category;
  const canonical = (id: string) => id.replace(/^bundled-rounds:/, "");
  const lastSeen = new Map<string, number>();
  history.forEach((session, index) => {
    for (const id of session.questionIds)
      if (!lastSeen.has(canonical(id))) lastSeen.set(canonical(id), index);
  });
  const age = (q: Question) => lastSeen.get(canonical(q.id)) ?? history.length;
  const order = (a: Question, b: Question) =>
    age(b) - age(a) ||
    hash(date + a.id) - hash(date + b.id) ||
    a.id.localeCompare(b.id);
  const chosen: Question[] = [];
  const seen = new Set();
  const add = (q: Question | undefined) => {
    if (q && !seen.has(q.id)) {
      chosen.push(q);
      seen.add(q.id);
    }
  };
  const take = (pool: Question[], count: number) =>
    pool
      .filter((q) => !seen.has(q.id))
      .sort(order)
      .slice(0, count)
      .forEach(add);
  const full = kind === "full",
    theory = eligible.filter((q) => q.kind === "theory");
  if (full && format !== "mixed") {
    const pool = eligible.filter(
      (q) =>
        q.roundFormat === format &&
        q.kind === (format === "design" ? "design" : "practice") &&
        q.answer.trim() &&
        q.criteria?.trim(),
    );
    if (format === "coding") {
      const categoryCount = (q: Question) =>
        chosen.filter((item) => item.category === q.category).length;
      const codingOrder = (a: Question, b: Question) =>
        age(b) - age(a) || categoryCount(a) - categoryCount(b) || order(a, b);
      for (let index = 0; index < 3; index++)
        add(
          pool
            .filter((q) => q.codingRole === "short" && !seen.has(q.id))
            .sort(codingOrder)[0],
        );
      // Unlabelled personal tasks retain their original role as a main exercise.
      add(pool.filter((q) => q.codingRole !== "short").sort(codingOrder)[0]);
      return chosen;
    }
    // Include a task in the selected stack when one is available, then vary the rest.
    if (format !== "design")
      take(
        pool.filter(
          (q) => q.category === (profile === "react" ? "React" : "Vue"),
        ),
        1,
      );
    take(pool, (format === "design" ? 1 : 3) - chosen.length);
    return chosen;
  }
  // Reserve each common area and the selected framework before filling optional places.
  for (const [category, count] of [
    ["JavaScript", full ? 2 : 1],
    ["TypeScript", 2],
    [profile === "react" ? "React" : "Vue", full ? 3 : 2],
    ["Браузер, HTML и CSS", 1],
    ["Сети и безопасность", 1],
    ["Архитектура, производительность и тестирование", full ? 2 : 1],
  ] as [string, number][])
    take(
      theory.filter((q) => categoryOf(q) === category),
      count,
    );
  const practice = eligible.filter(
    (q) =>
      q.kind === "practice" &&
      [
        "JavaScript",
        "TypeScript",
        profile === "react" ? "React" : "Vue",
        "Тестирование",
      ].includes(q.category),
  );
  const design = eligible.filter((q) => q.kind === "design");
  if (full) {
    take(practice, 2);
    take(design, 1);
  } else take(hash(date) % 2 && design.length ? design : practice, 1);
  const projects = eligible.filter((q) => q.kind === "project");
  const projectLimit = full ? 5 : 2;
  const projectCount = () =>
    chosen.filter((question) => question.kind === "project").length;
  const reserve = (key: (question: Question) => string) => {
    for (const value of [...new Set([...projects].sort(order).map(key))]) {
      if (projectCount() >= projectLimit) break;
      if (
        !chosen.some(
          (question) => question.kind === "project" && key(question) === value,
        )
      )
        take(
          projects.filter((question) => key(question) === value),
          1,
        );
    }
  };
  reserve((question) => question.category);
  reserve((question) => question.project || "");
  reserve((question) => `${question.project}:${question.projectGroup || ""}`);
  take(projects, projectLimit - projectCount());
  if (full)
    take(
      eligible.filter((question) => question.kind === "behavioral"),
      1,
    );
  // A personal package is optional: shared material fills the remaining interview.
  take(theory, Math.max(0, (full ? 20 : 11) - chosen.length));
  return chosen;
}
function makeSession(
  chosen: Question[],
  kind: Interview["kind"],
  date: string,
  id: string,
  profile: StackProfile,
  format: InterviewFormat = "mixed",
): Interview {
  return {
    id,
    kind,
    date,
    profile,
    ...(kind === "full" && format !== "mixed" ? { format } : {}),
    questionIds: chosen.map((q) => q.id),
    index: 0,
    finished: false,
    skipped: [],
    ratings: {},
    snapshots: Object.fromEntries(
      chosen.map((q) => {
        const snapshot = structuredClone(q);
        if (snapshot.followupAnswers !== undefined)
          snapshot.followups = (snapshot.followups || []).filter((title) =>
            snapshot.followupAnswers?.some(
              (item) => item.title === title && item.answer.trim(),
            ),
          );
        return [q.id, snapshot];
      }),
    ),
  };
}
export function createSession(
  questions: Question[],
  kind: Interview["kind"] = "full",
  progress: Record<string, Mark> = {},
  profile: StackProfile = "vue",
  format: InterviewFormat = "mixed",
  history: Pick<Interview, "questionIds">[] = [],
) {
  const date = localDate();
  const id =
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return makeSession(
    selectInterview(
      questions,
      kind,
      date + id,
      history,
      progress,
      profile,
      format,
    ),
    kind,
    date,
    id,
    profile,
    format,
  );
}
export function dailySession(
  state: Progress,
  questions: Question[],
  date: string = localDate(),
  profile: StackProfile = "vue",
) {
  const key = dailyKey(date, profile);
  if (state.daily[key]) return state;
  const history = Object.entries(state.daily)
    .filter(
      ([d, session]) => d < date && (session.profile || "vue") === profile,
    )
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, s]) => s);
  const session = makeSession(
    selectInterview(
      questions,
      "daily",
      date,
      history,
      state.questionProgress,
      profile,
    ),
    "daily",
    date,
    `daily:${key}`,
    profile,
  );
  if (!session.questionIds.length) return state;
  return { ...state, daily: { ...state.daily, [key]: session } };
}
export const dailyKey = (date: string, profile: StackProfile = "vue") =>
  profile === "vue" ? date : `${date}:react`;
