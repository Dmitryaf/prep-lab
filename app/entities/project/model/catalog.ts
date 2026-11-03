import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { emptyProjectCatalog } from "../../../../domain/projects/catalog.ts";
import { getProjectCatalog } from "../api/catalog.ts";
import { projectQuestions } from "./questions.ts";
export const useProjectCatalog = defineStore("project-catalog", () => {
  const catalog = shallowRef(emptyProjectCatalog()),
    ready = ref(false),
    error = ref("");
  const projects = computed(() => catalog.value.projects),
    topics = computed(() => catalog.value.topics);
  const projectCards = computed(() =>
    projectQuestions(topics.value, projects.value, catalog.value.experience),
  );
  let pending: Promise<void> | undefined;
  function initialize() {
    return (pending ??= (async () => {
      try {
        catalog.value = await getProjectCatalog();
        error.value = "";
      } catch (cause) {
        error.value =
          cause instanceof Error ? cause.message : "Личные проекты недоступны.";
      } finally {
        ready.value = true;
        pending = undefined;
      }
    })());
  }
  return { catalog, projects, topics, projectCards, ready, error, initialize };
});
