import { defineStore } from "pinia";
import type { Interview } from "#domain/interview/state.ts";
import {
  dailySession,
  createSession,
  localDate,
  dailyKey,
} from "#domain/interview/selection.ts";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
import { useQuestions } from "#ui/entities/question/model/store.ts";
import { useSettings } from "#ui/entities/preparation/model/settings.ts";
import type { InterviewFormat } from "#domain/interview/formats.ts";
import { useNotices } from "#ui/shared/model/notices.ts";

export const useInterview = defineStore("interview", () => {
  const preparation = usePreparation(),
    catalog = useQuestions();
  const settings = useSettings();
  const { notify } = useNotices();
  async function setSession(session: Interview) {
    const next = structuredClone(preparation.progress);
    if (session.kind === "daily")
      next.daily[dailyKey(session.date, session.profile)] = session;
    else next.sessions[session.id] = session;
    next.activeSession = session.id;
    return preparation.persist(next);
  }
  async function startDaily() {
    const profile = settings.settings.profile;
    const next = dailySession(
      preparation.progress,
      catalog.questions,
      localDate(),
      profile,
    );
    return (await preparation.persist(next))
      ? next.daily[dailyKey(localDate(), profile)]?.id
      : undefined;
  }
  async function startFull(format: InterviewFormat = "mixed") {
    const session = createSession(
      catalog.questions,
      "full",
      preparation.progress.questionProgress,
      settings.settings.profile,
      format,
      Object.values(preparation.progress.sessions)
        .filter(
          (session) =>
            (session.profile || "vue") === settings.settings.profile &&
            (session.format || "mixed") === format,
        )
        .reverse(),
    );
    if (!session.questionIds.length) {
      notify("Для этого формата пока нет готовых задач в выбранном профиле.");
      return;
    }
    return (await setSession(session)) ? session.id : undefined;
  }
  return { setSession, startDaily, startFull };
});
