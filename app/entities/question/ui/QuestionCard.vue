<script setup lang="ts">
import type { Question } from "../../../../domain/knowledge/question.ts";
import { kindLabel, categoryLabel } from "../lib/presentation.ts";
import MarkdownContent from "../../material/ui/MarkdownContent.vue";
import AnswerPanel from "./AnswerPanel.vue";
defineProps<{ question: Question; revealed?: boolean; followup?: number }>();
</script>
<template>
  <article class="platform-card question-card">
    <div class="platform-meta">
      {{ followup ? "Уточняющий вопрос" : kindLabel(question) }} ·
      {{ categoryLabel(question) }}
    </div>
    <template v-if="followup"
      ><p>{{ question.title }}</p>
      <h2>{{ question.followups?.[followup - 1] }}</h2></template
    >
    <template v-else
      ><h2>{{ question.title }}</h2>
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
