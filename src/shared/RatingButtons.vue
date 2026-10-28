<script setup lang="ts">
import type { Rating } from "./types";
import { progress, rate } from "../app/store";
defineProps<{ id: string; sessionId?: string }>();
const options: { value: Rating; label: string }[] = [
  { value: "done", label: "Ответил уверенно" },
  { value: "partial", label: "Частично" },
  { value: "again", label: "Не смог ответить" },
];
</script>
<template>
  <div class="platform-ratings" role="group" aria-label="Результат ответа">
    <button
      v-for="option in options"
      :key="option.value"
      data-action="rate"
      :data-id="id"
      :data-rating="option.value"
      :aria-pressed="progress.questionProgress[id]?.status === option.value"
      @click="rate(id, option.value, sessionId)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
