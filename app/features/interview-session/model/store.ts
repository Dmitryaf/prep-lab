import { defineStore } from "pinia";
import type { Interview } from "../../../../domain/interview/state.ts";
import {
  dailySession,
  createSession,
  localDate,
  dailyKey,
} from "../../../../domain/interview/selection.ts";
import { usePreparation } from "../../../entities/preparation/model/store.ts";
import { useQuestions } from "../../../entities/question/model/store.ts";
import { useSettings } from "../../../entities/preparation/model/settings.ts";

export const useInterview = defineStore("interview", () => {
  const preparation = usePreparation(),
    catalog = useQuestions();
  const settings = useSettings();
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
  async function startFull() {
    const session = createSession(
      catalog.questions,
      "full",
      preparation.progress.questionProgress,
      settings.settings.profile,
    );
    return (await setSession(session)) ? session.id : undefined;
  }
  return { setSession, startDaily, startFull };
});
