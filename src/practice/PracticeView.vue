<script setup lang="ts">
import { computed, ref, watch, toRefs } from "vue";
import { practiceState } from "./state";
import { useRoute, useRouter } from "vue-router";
import { knowledge, questions, loading } from "../app/store";
import { projectCards } from "../projects/catalog";
import PageHeading from "../shared/PageHeading.vue";
import QuestionCard from "../shared/QuestionCard.vue";
import RatingButtons from "../shared/RatingButtons.vue";
import StudyLinks from "../shared/StudyLinks.vue";
const route = useRoute(),
  router = useRouter(),
  revealed = ref(false);
const { filter, kind, index } = toRefs(practiceState);
const selected = computed(() =>
  questions.value.find((q) => q.id === route.query.question),
);
watch(
  () => [route.query.question, knowledge.value],
  () => {
    revealed.value = false;
    const q = selected.value;
    if (q) {
      filter.value =
        q.source === "projects"
          ? "projects"
          : knowledge.value.route.includes(q.id)
            ? "route"
            : q.category;
      kind.value = "all";
    } else if (route.query.category === "projects") {
      filter.value = "projects";
      kind.value = "all";
      index.value = 0;
    }
  },
  { immediate: true },
);
const categories = computed(() =>
  [...new Set(knowledge.value.questions.map((q) => q.category))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  ),
);
const list = computed(() => {
  let qs =
    filter.value === "route"
      ? knowledge.value.route
          .map((id) => questions.value.find((q) => q.id === id))
          .filter((q) => q !== undefined)
      : filter.value === "projects"
        ? projectCards
        : filter.value === "mixed"
          ? knowledge.value.questions
          : knowledge.value.questions.filter(
              (q) => q.category === filter.value,
            );
  return kind.value === "all" ? qs : qs.filter((q) => q.kind === kind.value);
});
const current = computed(() =>
  route.query.question
    ? selected.value
    : list.value[index.value % Math.max(1, list.value.length)],
);
function changeFilter() {
  index.value = 0;
  revealed.value = false;
  if (route.query.question) void router.replace({ path: "/practice" });
}
function next(random = false) {
  revealed.value = false;
  index.value = random
    ? Math.floor(Math.random() * Math.max(1, list.value.length))
    : route.query.question
      ? list.value.findIndex((q) => q.id === selected.value?.id) + 1
      : index.value + 1;
  if (route.query.question) void router.push({ path: "/practice" });
}
</script>
<template>
  <PageHeading
    title="Практика"
    description="Начните с основного маршрута. Остальные темы выбирайте по пробелам или требованиям вакансии. Сначала ответьте, затем откройте разбор."
  />
  <div class="platform-filters">
    <label
      >Направление<select
        id="practiceCategory"
        v-model="filter"
        @change="changeFilter"
      >
        <option value="mixed">Вся база · расширенная практика</option>
        <option value="route">
          Основной маршрут · {{ knowledge.route.length }} пунктов
        </option>
        <option
          v-for="category in categories"
          :key="category"
          :value="category"
        >
          {{ category }}
        </option>
        <option value="projects">
          Проекты и рабочий опыт · {{ projectCards.length }} вопросов
        </option>
      </select></label
    ><label
      >Формат<select id="practiceKind" v-model="kind" @change="changeFilter">
        <option value="all">Все форматы</option>
        <option value="theory">Вопросы</option>
        <option value="practice">Практические задачи</option>
        <option value="design">Проектирование</option>
        <option value="behavioral">Опыт и коммуникация</option>
      </select></label
    >
  </div>
  <template v-if="current"
    ><div class="platform-meta">
      {{
        route.query.question
          ? "Выбранный вопрос"
          : `${(index % list.length) + 1} из ${list.length}`
      }}
    </div>
    <QuestionCard :key="current.id" :question="current" :revealed="revealed" />
    <div class="platform-actions">
      <button
        v-if="!revealed"
        class="primary"
        data-action="reveal"
        @click="revealed = true"
      >
        Показать ответ</button
      ><button data-action="next-question" @click="next()">
        Следующий вопрос →</button
      ><button
        v-if="!route.query.question"
        data-action="random-question"
        @click="next(true)"
      >
        Случайный вопрос
      </button>
    </div>
    <template v-if="revealed"
      ><RatingButtons :id="current.id" /><StudyLinks
        :question="current" /></template
  ></template>
  <div v-else class="platform-card">
    <p>
      {{
        loading
          ? "Загружаем вопросы…"
          : "По этому фильтру вопросов нет. Выберите другое направление или формат."
      }}
    </p>
  </div>
</template>
