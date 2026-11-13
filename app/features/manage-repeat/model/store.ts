import { defineStore } from "pinia";
import type { Rating } from "#domain/interview/rating.ts";
import { rateQuestion } from "#domain/interview/saved-state.ts";
import { dailyKey } from "#domain/interview/selection.ts";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
import { useNotices } from "#ui/shared/model/notices.ts";

export const useRepeat = defineStore("repeat", () => {
  const preparation = usePreparation(),
    notices = useNotices();
  async function rate(id: string, status: Rating, sessionId?: string) {
    const next = rateQuestion(preparation.progress, id, status);
    const session = preparation.sessions.find((item) => item.id === sessionId);
    if (session && (session.finished || session.kind === "daily")) {
      const updated = structuredClone(session);
      updated.ratings[id] = status;
      if (session.kind === "daily")
        next.daily[dailyKey(session.date, session.profile)] = updated;
      else next.sessions[session.id] = updated;
    }
    if (await preparation.persist(next))
      notices.notify("Отметка сохранена.", "success");
  }
  return { rate };
});
