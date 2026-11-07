<script setup lang="ts">
import { computed } from "vue";
import type { Question } from "#domain/knowledge/question.ts";
import {
  kindLabel,
  categoryLabel,
} from "#ui/entities/question/lib/presentation.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
import AnswerPanel from "./AnswerPanel.vue";
const props = defineProps<{
  question: Question;
  revealed?: boolean;
  followup?: number;
}>();
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
        followup
          ? question.codingRole
            ? "Необязательное усложнение"
            : "Уточняющий вопрос"
          : question.codingRole === "short"
            ? "Короткая задача · 5–10 минут"
            : question.codingRole === "main"
              ? "Основная задача · 15–25 минут"
              : question.codingRole === "advanced"
                ? "Дополнительная практика"
                : kindLabel(question)
      }}
      ·
      {{ categoryLabel(question) }}
    </div>
    <template v-if="followup"
      ><p>{{ question.title }}</p>
      <h2 tabindex="-1">{{ question.followups?.[followup - 1] }}</h2>
      <MarkdownContent
        v-if="stage?.prompt"
        :text="
          stage.prompt.startsWith(stage.title + '\n\n')
            ? stage.prompt.slice(stage.title.length + 2)
            : stage.prompt
        "
        :source-id="question.noteId"
      />
    </template>
    <template v-else
      ><h2 tabindex="-1">{{ question.title }}</h2>
      <MarkdownContent
        v-if="question.prompt && question.prompt !== question.title"
        :text="
          question.prompt.startsWith(question.title + '\n\n')
            ? question.prompt.slice(question.title.length + 2)
            : question.prompt
        "
        :source-id="question.noteId"
    /></template>
    <AnswerPanel
      v-if="revealed"
      :question="question"
      :for-followup="!!followup"
    />
    <slot />
  </article>
</template>
