<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
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
const activeTab = ref<"answer" | "followups">("answer");
const panelId = useId();
watch(
  () => props.question.id,
  () => {
    activeTab.value = "answer";
  },
);
function switchTab(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  activeTab.value =
    event.key === "Home"
      ? "answer"
      : event.key === "End"
        ? "followups"
        : activeTab.value === "answer"
          ? "followups"
          : "answer";
  document.getElementById(`${panelId}-${activeTab.value}-tab`)?.focus();
}
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
        prompt:
          prompt.trim() === title.trim()
            ? ""
            : prompt.startsWith(title + "\n\n")
              ? prompt.slice(title.length + 2)
              : prompt,
      };
    })
    .filter((item) => item.answer?.trim()),
);
</script>
<template>
  <div
    v-if="followups.length"
    class="answer-tabs"
    role="tablist"
    aria-label="Разбор вопроса"
    @keydown="switchTab"
  >
    <button
      v-for="tab in ['answer', 'followups'] as const"
      :id="`${panelId}-${tab}-tab`"
      :key="tab"
      role="tab"
      :aria-selected="activeTab === tab"
      :aria-controls="`${panelId}-${tab}`"
      :tabindex="activeTab === tab ? 0 : -1"
      @click="activeTab = tab"
    >
      {{ tab === "answer" ? "Ответ" : `Уточнения · ${followups.length}` }}
    </button>
  </div>
  <section
    v-show="activeTab === 'answer'"
    :id="`${panelId}-answer`"
    class="platform-answer"
    :role="followups.length ? 'tabpanel' : undefined"
    :aria-labelledby="followups.length ? `${panelId}-answer-tab` : undefined"
  >
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
    <MarkdownContent
      v-if="content.additional"
      :text="content.additional"
      :source-id="question.noteId"
    />
    <MarkdownContent
      v-if="content.details"
      :text="content.details"
      :source-id="question.noteId"
    />
    <template v-if="question.criteria"
      ><h4>Проверьте себя</h4>
      <MarkdownContent :text="question.criteria" :source-id="question.noteId"
    /></template>
  </section>
  <section
    v-if="followups.length"
    v-show="activeTab === 'followups'"
    :id="`${panelId}-followups`"
    class="answer-followups"
    role="tabpanel"
    :aria-labelledby="`${panelId}-followups-tab`"
  >
    <ul>
      <li v-for="item in followups" :key="item.title">
        <h3>{{ item.title }}</h3>
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
  </section>
</template>
<style scoped>
.answer-tabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--line);
  margin-top: 24px;
}
.answer-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 12px 0;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
}
.answer-tabs button[aria-selected="true"] {
  border-color: var(--accent);
  color: var(--accent);
}
.answer-tabs + .platform-answer {
  margin-top: 0;
  border-top: 0;
}
.answer-followups ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.answer-followups li {
  padding-block: 20px;
}
.answer-followups li + li {
  border-top: 1px solid var(--line);
}
.answer-followups h3 {
  font-size: 18px;
  margin-top: 0;
}
</style>
