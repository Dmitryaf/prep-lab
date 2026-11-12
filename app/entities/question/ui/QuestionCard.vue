<script setup lang="ts">
import { computed } from "vue";
import type { Question } from "#domain/knowledge/question.ts";
import {
  kindLabel,
  categoryLabel,
} from "#ui/entities/question/lib/presentation.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
import AnswerPanel from "./AnswerPanel.vue";
import QuestionApproach from "./QuestionApproach.vue";
const props = defineProps<{
  question: Question;
  revealed?: boolean;
  hideApproach?: boolean;
  followup?: number;
  followupAnswer?: Question | null;
  followupRevealed?: boolean;
}>();
defineEmits<{ revealFollowup: [] }>();
const stage = computed(() =>
  props.question.followupAnswers?.find(
    (item) =>
      item.title === props.question.followups?.[(props.followup || 0) - 1],
  ),
);
</script>
<template>
  <article class="platform-card question-card">
    <div class="platform-meta">
      {{
        question.codingRole === "short"
          ? "Короткая задача"
          : question.codingRole === "main"
            ? "Основная задача"
            : question.codingRole === "advanced"
              ? "Дополнительная практика"
              : kindLabel(question)
      }}
      ·
      {{ categoryLabel(question) }}
    </div>
    <h2 tabindex="-1">{{ question.title }}</h2>
    <MarkdownContent
      v-if="question.prompt && question.prompt !== question.title"
      :text="
        question.prompt.startsWith(question.title + '\n\n')
          ? question.prompt.slice(question.title.length + 2)
          : question.prompt
      "
      :source-id="question.noteId"
    />
    <QuestionApproach v-if="!followup && !hideApproach" :question="question" />
    <section
      v-if="followup"
      class="followup-question"
      aria-label="Уточнение к вопросу"
    >
      <div class="platform-meta">
        {{ question.codingRole ? "Дополнительный этап" : "Уточняющий вопрос" }}
      </div>
      <h3 tabindex="-1">{{ question.followups?.[followup - 1] }}</h3>
      <MarkdownContent
        v-if="stage?.prompt"
        :text="
          stage.prompt.startsWith(stage.title + '\n\n')
            ? stage.prompt.slice(stage.title.length + 2)
            : stage.prompt
        "
        :source-id="question.noteId"
      />
      <QuestionApproach
        :question="
          followupAnswer || {
            ...question,
            title: question.followups?.[followup - 1] || question.title,
          }
        "
        followup
      />
      <AnswerPanel
        v-if="followupRevealed && followupAnswer?.availableAnswer"
        :question="followupAnswer"
      />
      <button
        v-else-if="followupAnswer?.availableAnswer"
        data-action="followup-review"
        @click="$emit('revealFollowup')"
      >
        Показать ответ на уточнение
      </button>
      <p v-else>Отдельный разбор этого уточнения пока не добавлен.</p>
    </section>
    <AnswerPanel
      v-if="revealed && !followup"
      :question="question"
      :for-followup="!!followup"
    />
    <slot />
  </article>
</template>
<style scoped>
.followup-question {
  margin-top: 24px;
  padding: 20px;
  border-left: 3px solid var(--accent);
  border-radius: 0 8px 8px 0;
  background: var(--surface, #f6f8fc);
}
.followup-question h3 {
  margin-block: 10px 18px;
  font-size: 21px;
  line-height: 1.5;
}
</style>
