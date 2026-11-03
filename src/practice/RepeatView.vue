<script setup lang="ts">
import { computed } from "vue";
import { weakQuestions, questions, progress } from "../app/store";
import PageHeading from "../shared/PageHeading.vue";
import QuestionList from "../shared/QuestionList.vue";
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
  <PageHeading
    title="Повторить"
    description="Вопросы, на которые пока не удалось ответить уверенно."
  /><QuestionList v-if="weakQuestions.length" :items="weakQuestions" />
  <section v-else class="platform-card">
    <h2>Вопросов для повторения пока нет</h2>
    <p>После практики отметьте «Частично» или «Не смог ответить».</p>
    <RouterLink to="/practice">Перейти к практике →</RouterLink>
  </section>
  <p v-if="absent" class="platform-notice">
    Ещё {{ absent }} отметок относятся к временно недоступным материалам. Они
    сохранены.
  </p>
</template>
