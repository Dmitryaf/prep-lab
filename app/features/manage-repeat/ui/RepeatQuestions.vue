<script setup lang="ts">
import { storeToRefs } from "pinia";

import { computed } from "vue";
import { useQuestions } from "#ui/entities/question/model/store.ts";
const { weakQuestions, questions } = storeToRefs(useQuestions());
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
const { progress } = storeToRefs(usePreparation());

import PageHeading from "#ui/shared/ui/PageHeading.vue";
import QuestionList from "#ui/entities/question/ui/QuestionList.vue";
const absent = computed(
  () =>
    Object.entries(progress.value.questionProgress).filter(
      ([id, p]) =>
        !questions.value.some((q) => q.id === id) &&
        ["again", "partial"].includes(p.status),
    ).length,
);
</script>
<template>
  <PageHeading title="Повторить" /><QuestionList
    v-if="weakQuestions.length"
    :items="weakQuestions"
  />
  <section v-else class="platform-card">
    <h2>Вопросов для повторения пока нет</h2>
    <RouterLink to="/practice">Перейти к практике →</RouterLink>
  </section>
  <p v-if="absent" class="platform-notice">
    Ещё {{ absent }} отметок относятся к временно недоступным материалам. Они
    сохранены.
  </p>
</template>
