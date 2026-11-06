import { defineStore } from "pinia";
import { onScopeDispose, ref } from "vue";
import type { AnswerAttempt, Progress } from "#domain/interview/state.ts";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
import { useNotices } from "#ui/shared/model/notices.ts";

interface Draft {
  text: string;
  solutionUrl: string;
  baselineText: string;
  baselineUrl: string;
  saved: boolean;
  error: string;
  saving: boolean;
}
export const hasChanges = (draft: Draft) =>
  draft.text !== draft.baselineText || draft.solutionUrl !== draft.baselineUrl;

export const useAnswerAttempts = defineStore("answer-attempts", () => {
  const preparation = usePreparation();
  const notices = useNotices();
  const drafts = ref<Record<string, Draft>>({});
  function savedAttempt(questionId: string, sessionId?: string) {
    return sessionId
      ? preparation.sessions.find((session) => session.id === sessionId)
          ?.attempts?.[questionId]
      : preparation.progress.practiceAttempts?.[questionId];
  }
  function draftFor(questionId: string, sessionId?: string): Draft {
    const key = JSON.stringify([sessionId ?? null, questionId]);
    const saved = savedAttempt(questionId, sessionId);
    const existing = drafts.value[key];
    if (!existing) {
      drafts.value[key] = {
        text: saved?.text ?? "",
        solutionUrl: saved?.solutionUrl ?? "",
        baselineText: saved?.text ?? "",
        baselineUrl: saved?.solutionUrl ?? "",
        saved: !!saved,
        error: "",
        saving: false,
      };
    } else if (!hasChanges(existing) && !existing.saving) {
      existing.text = existing.baselineText = saved?.text ?? "";
      existing.solutionUrl = existing.baselineUrl = saved?.solutionUrl ?? "";
      existing.saved = !!saved;
    }
    return drafts.value[key]!;
  }
  async function save(questionId: string, sessionId?: string) {
    const draft = draftFor(questionId, sessionId);
    if (draft.saving) return;
    draft.error = "";
    const attempt: AnswerAttempt = {
      text: draft.text,
      solutionUrl: draft.solutionUrl,
      updatedAt: new Date().toISOString(),
    };
    const state = preparation.progress;
    let next: Progress;
    if (sessionId) {
      const session = preparation.sessions.find(
        (item) => item.id === sessionId,
      );
      if (!session || !session.questionIds.includes(questionId)) {
        draft.error =
          "Интервью недоступно. Текст попытки сохранён в этой вкладке.";
        return;
      }
      const namespace = session.kind === "daily" ? "daily" : "sessions";
      const key = Object.keys(state[namespace]).find(
        (id) => state[namespace][id]?.id === sessionId,
      )!;
      next = {
        ...state,
        [namespace]: {
          ...state[namespace],
          [key]: {
            ...session,
            attempts: { ...session.attempts, [questionId]: attempt },
          },
        },
      };
    } else {
      next = {
        ...state,
        practiceAttempts: { ...state.practiceAttempts, [questionId]: attempt },
      };
    }
    draft.saving = true;
    try {
      if (await preparation.persist(next)) {
        draft.baselineText = attempt.text;
        draft.baselineUrl = attempt.solutionUrl;
        draft.saved = true;
        notices.notify("Попытка сохранена.");
      } else
        draft.error =
          preparation.saveError ||
          "Попытка не сохранена. Текст остаётся в этой вкладке; повторите сохранение.";
    } finally {
      draft.saving = false;
    }
  }
  const warnBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!Object.values(drafts.value).some(hasChanges)) return;
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", warnBeforeUnload);
  onScopeDispose(() =>
    window.removeEventListener("beforeunload", warnBeforeUnload),
  );
  return { drafts, draftFor, save };
});
