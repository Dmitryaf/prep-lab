<script setup lang="ts">
import { storeToRefs } from "pinia";

import type { Rating } from "#domain/interview/rating.ts";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
const { progress, saving } = storeToRefs(usePreparation());
import { useRepeat } from "#ui/features/manage-repeat/model/store.ts";
const { rate } = useRepeat();

defineProps<{ id: string; sessionId?: string; compact?: boolean }>();
const options: { value: Rating; label: string; short: string }[] = [
  { value: "done", label: "Ответил уверенно", short: "Уверенно" },
  { value: "partial", label: "Частично", short: "Частично" },
  { value: "again", label: "Не смог ответить", short: "Не ответил" },
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
      :disabled="saving"
      :aria-pressed="progress.questionProgress[id]?.status === option.value"
      :aria-label="option.label"
      @click="rate(id, option.value, sessionId)"
    >
      {{ compact ? option.short : option.label }}
    </button>
  </div>
</template>
