import { defineStore } from "pinia";
import type { Rating } from "#domain/interview/rating.ts";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";

export const useProjectReview = defineStore("project-review", () => {
  const preparation = usePreparation();
  function markTopic(id: string, status: Rating) {
    return preparation.persist({
      ...preparation.progress,
      progress: {
        ...preparation.progress.progress,
        [id]: { status, updatedAt: new Date().toISOString() },
      },
    });
  }
  return { markTopic };
});
