<script setup lang="ts">
import type { Question } from "../../../../domain/knowledge/question.ts";
import { link } from "../../../shared/lib/navigation.ts";
import { kindLabel, categoryLabel } from "../lib/presentation.ts";
defineProps<{ items: Question[] }>();
</script>
<template>
  <RouterLink
    v-for="q in items"
    :key="q.id"
    class="platform-list-row"
    :to="link('practice', { question: q.id })"
    ><span
      ><strong>{{ q.title }}</strong
      ><small>{{ categoryLabel(q) }} · {{ kindLabel(q) }}</small></span
    ><span aria-hidden="true">→</span></RouterLink
  >
</template>
