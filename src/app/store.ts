import { computed, shallowRef, ref } from "vue";
import type { Knowledge, Progress, Interview, Rating } from "../shared/types";
import {
  loadState,
  saveState,
  importState,
  exportState,
  rateQuestion,
  dailySession,
  createSession,
  localDate,
  storageKey,
} from "../progress/engine.js";
import { projectCards } from "../projects/catalog";
import { canonicalNotePath } from "../knowledge/path.js";

const blank = (): Progress => ({
  version: 3,
  progress: {},
  questionProgress: {},
  sessions: {},
  daily: {},
  activeSession: null,
});
export const progress = shallowRef<Progress>(blank()),
  loadError = ref(""),
  message = ref(""),
  unavailable = ref(""),
  loading = ref(true);
export const knowledge = shallowRef<Knowledge>({
  notes: [],
  questions: [],
  route: [],
  warnings: [],
});
export const questions = computed(() => [
  ...knowledge.value.questions,
  ...projectCards,
]);
export const sessions = computed(() => [
  ...Object.values(progress.value.daily),
  ...Object.values(progress.value.sessions),
]);
export const weakQuestions = computed(() =>
  questions.value.filter((q) =>
    ["again", "partial"].includes(
      progress.value.questionProgress[q.id]?.status,
    ),
  ),
);
export function notify(text: string) {
  message.value = text;
}
export function persist(next: Progress) {
  if (loadError.value) {
    notify(
      "Сначала восстановите корректный файл прогресса. Сохранённые данные не перезаписаны.",
    );
    return false;
  }
  try {
    progress.value = saveState(next);
    return true;
  } catch {
    notify(
      "Не удалось сохранить изменение. Прежний прогресс сохранён; попробуйте ещё раз или освободите место в браузере.",
    );
    return false;
  }
}
export function setSession(s: Interview) {
  const next = structuredClone(progress.value);
  if (s.kind === "daily") next.daily[s.date] = s;
  else next.sessions[s.id] = s;
  next.activeSession = s.id;
  return persist(next);
}
export function rate(id: string, status: Rating, sessionId?: string) {
  const next = rateQuestion(progress.value, id, status),
    s = sessions.value.find((s) => s.id === sessionId);
  if (s && (s.finished || s.kind === "daily")) {
    const updated = structuredClone(s);
    updated.ratings[id] = status;
    if (s.kind === "daily") next.daily[s.date] = updated;
    else next.sessions[s.id] = updated;
  }
  if (persist(next)) notify("Отметка сохранена.");
}
export function markTopic(id: string, status: Rating) {
  return persist({
    ...progress.value,
    progress: {
      ...progress.value.progress,
      [id]: { status, updatedAt: new Date().toISOString() },
    },
  });
}
export function startDaily() {
  const next = dailySession(progress.value, questions.value);
  return persist(next) ? next.daily[localDate()]?.id : undefined;
}
export function startFull() {
  const s = createSession(
    questions.value,
    "full",
    progress.value.questionProgress,
  );
  return setSession(s) ? s.id : undefined;
}
export function noteFor(id = "") {
  return knowledge.value.notes.find((n) => n.id === canonicalNotePath(id));
}
export async function fetchKnowledge() {
  loading.value = true;
  unavailable.value = "";
  try {
    const response = await fetch("/api/knowledge");
    if (!response.ok) throw Error("unavailable");
    const data: Knowledge = await response.json();
    if (
      !Array.isArray(data.notes) ||
      !data.notes.every(
        (n) => typeof n.id === "string" && typeof n.markdown === "string",
      ) ||
      !Array.isArray(data.questions) ||
      !data.questions.every(
        (q) =>
          typeof q.id === "string" &&
          typeof q.title === "string" &&
          typeof q.answer === "string",
      ) ||
      !Array.isArray(data.route) ||
      !data.route.every((id) => typeof id === "string")
    )
      throw Error("format");
    knowledge.value = data;
    if (data.warnings?.length)
      notify(
        "Некоторые материалы требуют внимания: " +
          data.warnings.slice(0, 2).join(" "),
      );
  } catch {
    unavailable.value =
      "База знаний временно недоступна. Проверьте подключённую папку и перезагрузите страницу. Карта проектов, её вопросы и сохранённый прогресс доступны.";
  } finally {
    loading.value = false;
  }
}
export function restore(text: string) {
  const next = importState(text, progress.value);
  saveState(next);
  progress.value = next;
  loadError.value = "";
  notify("Прогресс восстановлен.");
}
export function download() {
  if (loadError.value) {
    notify(
      "Экспорт остановлен: сохранённый прогресс не удалось прочитать. Исходные данные сохранены в браузере.",
    );
    return;
  }
  const blob = new Blob([exportState(progress.value)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `frontend-progress-${localDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function read() {
  try {
    progress.value = loadState();
    loadError.value = "";
  } catch {
    loadError.value =
      "Не удалось прочитать сохранённый прогресс. Данные сохранены в браузере; восстановите корректный экспорт, чтобы продолжить сохранение.";
  }
}
read();
window.addEventListener("storage", (event) => {
  if (event.key === storageKey) read();
});
