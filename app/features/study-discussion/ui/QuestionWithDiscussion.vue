<script setup lang="ts">
import { computed, ref } from "vue";
import type { Question } from "../../../../domain/knowledge/question.ts";
import QuestionCard from "../../../entities/question/ui/QuestionCard.vue";
import StudyDiscussion from "./StudyDiscussion.vue";
import QuestionTopics from "../../../entities/question/ui/QuestionTopics.vue";
import { useMaterials } from "../../../entities/material/model/store.ts";
import { studyTopics } from "../../../../domain/knowledge/study-topics.ts";
import { usePreparation } from "../../../entities/preparation/model/store.ts";
const materials = useMaterials();
const preparation = usePreparation();
const props = defineProps<{
  question: Question;
  revealed?: boolean;
  followup?: number;
  sessionId?: string;
}>();
const practiceFollowup = ref(0);
const activeFollowup = computed(() => props.followup || practiceFollowup.value);
const canExtendPractice = computed(() => {
  const attempt = preparation.progress.practiceAttempts?.[props.question.id];
  return (
    !props.sessionId &&
    props.question.roundFormat === "coding" &&
    props.question.codingRole &&
    props.question.followups?.length &&
    (attempt?.text.trim() || attempt?.solutionUrl.trim())
  );
});
const topics = computed(() =>
  studyTopics(props.question, materials.knowledge.notes),
);
const materialKey = computed(() =>
  props.revealed
    ? "question:" + props.question.id
    : props.sessionId
      ? "interview-hint:" + JSON.stringify([props.sessionId, props.question.id])
      : "question-hint:" + props.question.id,
);
const context = computed(() =>
  JSON.stringify(
    props.revealed
      ? props.question
      : {
          mode: "Подсказка до самостоятельного ответа. Помоги с рассуждением, не раскрывай полное решение.",
          id: props.question.id,
          title: props.question.title,
          prompt: props.question.prompt,
          ...(activeFollowup.value
            ? {
                followup:
                  props.question.followupAnswers?.find(
                    (item) =>
                      item.title ===
                      props.question.followups?.[activeFollowup.value - 1],
                  )?.prompt ||
                  props.question.followups?.[activeFollowup.value - 1],
              }
            : {}),
        },
    null,
    2,
  ),
);
</script>
<template>
  <div class="question-workspace" :class="{ 'has-topics': topics.length }">
    <div class="question-workspace-main">
      <QuestionCard
        :question="question"
        :revealed="revealed"
        :followup="activeFollowup"
        ><StudyDiscussion
          :key="materialKey"
          :material-key="materialKey"
          :title="question.title"
          :context="context"
      /></QuestionCard>
      <slot />
      <div v-if="canExtendPractice && !revealed" class="platform-actions">
        <button v-if="practiceFollowup" @click="practiceFollowup = 0">
          К основной задаче
        </button>
        <button
          v-for="(title, index) in question.followups"
          :key="title"
          :aria-pressed="practiceFollowup === index + 1"
          @click="practiceFollowup = index + 1"
        >
          Усложнение {{ index + 1 }}: {{ title }}
        </button>
      </div>
    </div>
    <QuestionTopics v-if="topics.length" :topics="topics" />
  </div>
</template>
<style scoped>
.question-workspace {
  margin-block: 20px;
}
.question-workspace.has-topics {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 24px;
  align-items: start;
}
.question-workspace-main {
  min-width: 0;
}
.question-workspace-main :deep(.question-card) {
  max-width: none;
  margin-top: 0;
}
@media (max-width: 1050px) {
  .question-workspace.has-topics {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
}
</style>
