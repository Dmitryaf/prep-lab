<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import type { Question } from "#domain/knowledge/question.ts";
import QuestionCard from "#ui/entities/question/ui/QuestionCard.vue";
import StudyDiscussion from "./StudyDiscussion.vue";
import QuestionTopics from "#ui/entities/question/ui/QuestionTopics.vue";
import { useMaterials } from "#ui/entities/material/model/store.ts";
import { studyTopics } from "#domain/knowledge/study-topics.ts";
import { followupQuestion } from "#domain/knowledge/followup.ts";
const materials = useMaterials();
const props = defineProps<{
  question: Question;
  revealed?: boolean;
  followup?: number;
  sessionId?: string;
}>();
const practiceFollowup = ref(0);
const activeFollowup = computed(() => props.followup || practiceFollowup.value);
const followupRevealed = ref(false);
const currentQuestion = computed(() =>
  materials.knowledge.questions.find((q) => q.id === props.question.id),
);
const selectedFollowup = computed(() =>
  followupQuestion(props.question, activeFollowup.value, currentQuestion.value),
);
watch(
  () => [props.question.id, activeFollowup.value],
  () => {
    followupRevealed.value = false;
  },
);
const workspace = ref<HTMLElement>();
const minimumHeight = ref<string>();
watch(
  () => props.question.id,
  () => {
    practiceFollowup.value = 0;
  },
);
watch(
  () => [props.question.id, activeFollowup.value],
  async () => {
    const element = workspace.value;
    if (!element) return;
    const top = element.getBoundingClientRect().top;
    const visibleTop = Math.max(16, top);
    const position = window.scrollY + top - visibleTop;
    // Keep enough room for a shorter question without the browser clamping scrollY.
    minimumHeight.value = `${Math.max(0, window.innerHeight - visibleTop)}px`;
    await nextTick();
    window.scrollTo({ top: position, behavior: "instant" });
    element
      .querySelector<HTMLElement>(".question-card h2")
      ?.focus({ preventScroll: true });
  },
);
const canExtendPractice = computed(
  () =>
    !props.sessionId &&
    props.question.roundFormat === "coding" &&
    props.question.codingRole &&
    props.question.followups?.length,
);
const topics = computed(() =>
  studyTopics(
    {
      ...props.question,
      learningLinks: [
        ...(props.question.learningLinks || []),
        ...(currentQuestion.value?.learningLinks || []),
      ],
    },
    materials.knowledge.notes,
  ),
);
const materialKey = computed(() =>
  props.revealed
    ? "question:" + props.question.id
    : props.sessionId
      ? "interview-hint:" + JSON.stringify([props.sessionId, props.question.id])
      : "question-hint:" + props.question.id,
);
const discussionKey = computed(() =>
  activeFollowup.value
    ? !followupRevealed.value && props.sessionId
      ? "interview-hint:" +
        JSON.stringify([
          props.sessionId,
          props.question.id,
          activeFollowup.value,
        ])
      : (followupRevealed.value ? "question:" : "question-hint:") +
        JSON.stringify([props.question.id, selectedFollowup.value?.title])
    : materialKey.value,
);
const context = computed(() =>
  JSON.stringify(
    (activeFollowup.value ? followupRevealed.value : props.revealed)
      ? {
          question: activeFollowup.value
            ? selectedFollowup.value
            : props.question,
          theory: topics.value
            .map((topic) =>
              materials.knowledge.notes.find(
                (note) => note.id === topic.noteId,
              ),
            )
            .filter((note) => !!note)
            .map((note) => ({
              title: note.title,
              text: note.markdown.slice(0, 6000),
            }))
            .slice(0, 4),
        }
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
  <div
    ref="workspace"
    class="question-workspace"
    :class="{ 'has-topics': topics.length }"
    :style="{ minHeight: minimumHeight }"
  >
    <div class="question-workspace-main">
      <QuestionCard
        :key="question.id + ':' + activeFollowup"
        :question="question"
        :revealed="revealed"
        :followup="activeFollowup"
        :followup-answer="selectedFollowup"
        :followup-revealed="followupRevealed"
        @reveal-followup="followupRevealed = true"
        ><StudyDiscussion
          :key="discussionKey"
          :material-key="discussionKey"
          :title="selectedFollowup?.title || question.title"
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
  overflow-anchor: none;
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
