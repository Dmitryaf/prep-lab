import type {
  IntensiveGoal,
  IntensiveSnapshot,
} from "#domain/intensive/contracts.ts";

export interface IntensiveCatalog {
  notes: {
    id: string;
    title: string;
    category: string;
    questionCount: number;
  }[];
  projects: { id: string; name: string; stack: string[]; topicCount: number }[];
}

export type LessonProgress = IntensiveSnapshot["state"]["progress"][string];
export type ProgressInput = Omit<LessonProgress, "updatedAt">;

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/intensive${path}`, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      result.error || result.statusMessage || "Не удалось сохранить интенсив.",
    );
  }
  return result as T;
}

export const getIntensive = () => request<IntensiveSnapshot>("");
export const getIntensiveCatalog = () => request<IntensiveCatalog>("/catalog");
export const prepareIntensive = (
  goal: IntensiveGoal,
  expectedRevision: number,
) => request<IntensiveSnapshot>("/draft", "POST", { goal, expectedRevision });
export const proposeIntensive = (
  goal: IntensiveGoal,
  lessonIds: string[],
  expectedRevision: number,
) =>
  request<IntensiveSnapshot>("/propose", "POST", {
    goal,
    lessonIds,
    expectedRevision,
  });
export const acceptIntensive = (
  lessonIds: string[],
  expectedRevision: number,
) =>
  request<IntensiveSnapshot>("/accept", "POST", {
    lessonIds,
    expectedRevision,
  });
export const saveIntensiveProgress = (
  lessonId: string,
  progress: ProgressInput,
  expectedRevision: number,
) =>
  request<IntensiveSnapshot>("/progress", "PUT", {
    lessonId,
    progress,
    expectedRevision,
  });
export const addIntensiveRepeat = (
  lessonId: string,
  text: string,
  expectedRevision: number,
) =>
  request<IntensiveSnapshot>("/tomorrow", "POST", {
    lessonId,
    text,
    expectedRevision,
  });
export const setIntensiveRepeat = (
  id: string,
  done: boolean,
  expectedRevision: number,
) =>
  request<IntensiveSnapshot>("/tomorrow", "PUT", {
    id,
    done,
    expectedRevision,
  });
