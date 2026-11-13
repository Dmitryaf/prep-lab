import { getKnowledge } from "#ui/entities/material/api/knowledge.ts";
import { defineStore } from "pinia";
import { shallowRef, ref, computed } from "vue";
import type { Knowledge } from "#domain/knowledge/material.ts";
import { findMaterial } from "#domain/knowledge/lookup.ts";
import { useNotices } from "#ui/shared/model/notices.ts";
import { useSettings } from "#ui/entities/preparation/model/settings.ts";
import { knowledgeForProfile } from "#domain/knowledge/profile.ts";

export const useMaterials = defineStore("materials", () => {
  const baseKnowledge = shallowRef<Knowledge>({
    notes: [],
    questions: [],
    route: [],
    warnings: [],
  });
  const settings = useSettings();
  const knowledge = computed(() =>
    knowledgeForProfile(baseKnowledge.value, settings.settings.profile),
  );
  const loading = ref(true),
    ready = ref(false),
    unavailable = ref("");
  const notices = useNotices();
  function noteFor(id = "", scope?: string) {
    return (
      findMaterial(knowledge.value.notes, id, scope) ||
      findMaterial(baseKnowledge.value.notes, id, scope)
    );
  }
  let pending: Promise<void> | undefined;
  function fetchKnowledge() {
    if (pending) return pending;
    loading.value = true;
    unavailable.value = "";
    pending = (async () => {
      try {
        const data = await getKnowledge();
        baseKnowledge.value = data;
        ready.value = true;
        if (data.warnings?.length)
          notices.notify(
            "Некоторые материалы требуют внимания: " +
              data.warnings.slice(0, 2).join(" "),
            "info",
          );
      } catch {
        unavailable.value =
          "Не удалось загрузить материалы. Попробуйте ещё раз.";
      } finally {
        loading.value = false;
        pending = undefined;
      }
    })();
    return pending;
  }
  return {
    knowledge,
    baseKnowledge,
    loading,
    ready,
    unavailable,
    noteFor,
    fetchKnowledge,
  };
});
