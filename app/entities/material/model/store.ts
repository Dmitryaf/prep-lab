import { getKnowledge } from "../api/knowledge.ts";
import { defineStore } from "pinia";
import { shallowRef, ref, computed } from "vue";
import type { Knowledge } from "../../../../domain/knowledge/material.ts";
import { canonicalNotePath } from "../../../../domain/knowledge/path.ts";
import { useNotices } from "../../../shared/model/notices.ts";
import { useSettings } from "../../preparation/model/settings.ts";
import { knowledgeForProfile } from "../../../../domain/knowledge/profile.ts";

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
    unavailable = ref("");
  const notices = useNotices();
  function noteFor(id = "") {
    return (
      knowledge.value.notes.find((note) => note.id === canonicalNotePath(id)) ||
      baseKnowledge.value.notes.find(
        (note) => note.id === canonicalNotePath(id),
      )
    );
  }
  async function fetchKnowledge() {
    loading.value = true;
    unavailable.value = "";
    try {
      const data = await getKnowledge();
      baseKnowledge.value = data;
      if (data.warnings?.length)
        notices.notify(
          "Некоторые материалы требуют внимания: " +
            data.warnings.slice(0, 2).join(" "),
        );
    } catch {
      unavailable.value =
        "База знаний временно недоступна. Проверьте подключённую папку и перезагрузите страницу. Карта проектов, её вопросы и сохранённые данные доступны.";
    } finally {
      loading.value = false;
    }
  }
  return {
    knowledge,
    baseKnowledge,
    loading,
    unavailable,
    noteFor,
    fetchKnowledge,
  };
});
