import { defineStore } from "pinia";
import { computed } from "vue";
import { useMaterials } from "../../material/model/store.ts";
import { usePreparation } from "../../preparation/model/store.ts";
import { useProjectCatalog } from "../../project/model/catalog.ts";
import { useSettings } from "../../preparation/model/settings.ts";
import {
  supportsQuestion,
  questionForProfile,
} from "../../../../domain/knowledge/profile.ts";

export const useQuestions = defineStore("questions", () => {
  const materials = useMaterials(),
    preparation = usePreparation(),
    projects = useProjectCatalog();
  const settings = useSettings();
  const projectCards = computed(() =>
    projects.projectCards
      .filter((question) =>
        supportsQuestion(question, settings.settings.profile),
      )
      .map((question) =>
        questionForProfile(question, settings.settings.profile),
      ),
  );
  const questions = computed(() => [
    ...materials.knowledge.questions,
    ...projectCards.value,
  ]);
  const weakQuestions = computed(() =>
    questions.value.filter((q) =>
      ["again", "partial"].includes(
        preparation.progress.questionProgress[q.id]?.status,
      ),
    ),
  );
  const questionById = (id: unknown) =>
    questions.value.find((question) => question.id === id) ||
    materials.baseKnowledge.questions.find((question) => question.id === id) ||
    projects.projectCards.find((question) => question.id === id);
  return { questions, weakQuestions, projectCards, questionById };
});
