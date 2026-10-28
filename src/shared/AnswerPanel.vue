<script setup lang="ts">
import type { Question } from "./types";
import MarkdownContent from "../knowledge/MarkdownContent.vue";
withDefaults(defineProps<{ question: Question; forFollowup?: boolean }>(), {
  forFollowup: false,
});
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
      v-if="question.shortAnswer || question.answer"
      :text="question.shortAnswer || question.answer"
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
    <details
      v-if="question.shortAnswer && question.answer !== question.shortAnswer"
    >
      <summary>Подробности из карточки</summary>
      <MarkdownContent :text="question.answer" :source-id="question.noteId" />
    </details>
    <details v-if="question.details">
      <summary>Подробности и пример</summary>
      <MarkdownContent :text="question.details" :source-id="question.noteId" />
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
