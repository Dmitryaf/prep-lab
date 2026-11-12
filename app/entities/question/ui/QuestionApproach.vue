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
  </aside>
</template>

<style scoped>
.question-approach {
  margin-block: 0 12px;
  padding: 13px 18px;
  border-radius: 8px;
  background: #edf3fb;
  color: #365276;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.question-approach p {
  margin: 0;
}
</style>
