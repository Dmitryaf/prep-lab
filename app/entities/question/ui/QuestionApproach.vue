<script setup lang="ts">
import { computed } from "vue";
import type { Question } from "#domain/knowledge/question.ts";
import { questionApproach } from "../lib/approach.ts";
const props = defineProps<{ question: Question; followup?: boolean }>();
const approach = computed(() =>
  questionApproach(props.question, props.followup),
);
</script>

<template>
  <aside
    v-if="approach"
    class="question-approach"
    aria-label="Подход к решению"
    :data-approach="approach.kind"
  >
    <p>{{ approach.summary }}</p>
    <details>
      <summary>Как подходить к решению</summary>
      <p>{{ approach.explanation }}</p>
    </details>
  </aside>
</template>

<style scoped>
.question-approach {
  margin-block: 18px;
  padding: 12px 16px;
  border-left: 2px solid var(--border);
  background: var(--surface, #f6f8fc);
  border-radius: 0 6px 6px 0;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.question-approach p {
  margin: 0;
}
.question-approach summary {
  margin-top: 6px;
  cursor: pointer;
}
.question-approach details[open] p {
  margin-top: 8px;
}
.question-approach summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
</style>
