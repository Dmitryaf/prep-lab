<script setup lang="ts">
import { computed } from "vue";
import type { Question } from "#domain/knowledge/question.ts";
import { answerContent } from "#domain/knowledge/answer-content.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
const props = withDefaults(
  defineProps<{ question: Question; forFollowup?: boolean }>(),
  {
    forFollowup: false,
  },
);
const content = computed(() => answerContent(props.question));
const followups = computed(() =>
  (props.question.followups || [])
    .map((title) => {
      const item = props.question.followupAnswers?.find(
        (f) => f.title === title,
      );
      const prompt = item?.prompt || "";
      return {
        title,
        answer: item?.answer,
        criteria: item?.criteria,
        prompt: prompt.startsWith(title + "\n\n")
          ? prompt.slice(title.length + 2)
          : prompt,
      };
    })
    .filter((item) => item.answer?.trim()),
);
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
      Готового разбора пока нет. Можно изучить связанную тему и самостоятельно
      проверить решение.
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
  <details v-if="followups.length" class="platform-card">
    <summary>
      {{
        question.codingRole
          ? "Дополнительные этапы и разбор"
          : "Уточнения и разбор"
      }}
    </summary>
    <ul>
      <li v-for="item in followups" :key="item.title">
        <strong>{{ item.title }}</strong>
        <MarkdownContent
          v-if="item.prompt"
          :text="item.prompt"
          :source-id="question.noteId"
        />
        <MarkdownContent
          v-if="item.answer"
          :text="item.answer"
          :source-id="question.noteId"
        />
        <p v-else>Ориентиры — в ответе на основной вопрос и связанной теме.</p>
        <template v-if="item.criteria">
          <h4>Критерии этапа</h4>
          <MarkdownContent :text="item.criteria" :source-id="question.noteId" />
        </template>
      </li>
    </ul>
  </details>
</template>
