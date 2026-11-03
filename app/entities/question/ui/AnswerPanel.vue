<script setup lang="ts">
import { computed } from "vue";
import type { Question } from "../../../../domain/knowledge/question.ts";
import { answerContent } from "../../../../domain/knowledge/answer-content.ts";
import MarkdownContent from "../../material/ui/MarkdownContent.vue";
const props = withDefaults(
  defineProps<{ question: Question; forFollowup?: boolean }>(),
  {
    forFollowup: false,
  },
);
const content = computed(() => answerContent(props.question));
</script>
<template>
  <section class="platform-answer">
    <h3>
      {{
        forFollowup
          ? "Разбор основной темы"
          : ["design", "behavioral"].includes(question.kind)
            ? "Ориентир для сверки"
            : "Ответ и разбор"
      }}
    </h3>
    <MarkdownContent
      v-if="content.main"
      :text="content.main"
      :source-id="question.noteId"
    />
    <p v-else>
      В исходном материале пока нет готового разбора. Можно изучить связанную
      тему и самостоятельно проверить решение.
    </p>
    <template v-if="question.criteria"
      ><h4>Проверьте себя</h4>
      <MarkdownContent :text="question.criteria" :source-id="question.noteId"
    /></template>
    <details v-if="content.additional">
      <summary>Дополнительно</summary>
      <MarkdownContent
        :text="content.additional"
        :source-id="question.noteId"
      />
    </details>
    <details v-if="content.details">
      <summary>Подробности и пример</summary>
      <MarkdownContent :text="content.details" :source-id="question.noteId" />
    </details>
  </section>
  <details v-if="question.followups?.length" class="platform-card">
    <summary>Уточнения и разбор</summary>
    <ul>
      <li v-for="title in question.followups" :key="title">
        <strong>{{ title }}</strong
        ><MarkdownContent
          v-if="
            question.followupAnswers?.find((f) => f.title === title)?.answer
          "
          :text="
            question.followupAnswers.find((f) => f.title === title)!.answer
          "
          :source-id="question.noteId"
        />
        <p v-else>Ориентиры — в ответе на основной вопрос и связанной теме.</p>
      </li>
    </ul>
  </details>
</template>
