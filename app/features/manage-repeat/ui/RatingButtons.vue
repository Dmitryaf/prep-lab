<script setup lang="ts">
import { storeToRefs } from "pinia";

import type { Rating } from "../../../../domain/interview/rating.ts";
import { usePreparation } from "../../../entities/preparation/model/store.ts";
const { progress, saving } = storeToRefs(usePreparation());
import { useRepeat } from "../model/store.ts";
const { rate } = useRepeat();

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
      :disabled="saving"
      :aria-pressed="progress.questionProgress[id]?.status === option.value"
      @click="rate(id, option.value, sessionId)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
