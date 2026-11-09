<script setup lang="ts">
import { storeToRefs } from "pinia";

import { computed, ref, watch, toRefs } from "vue";
import { practiceState } from "#ui/features/practice-question/model/navigation.ts";
import { isTestingTask } from "#domain/knowledge/question.ts";
import { useRoute, useRouter } from "vue-router";
import { useMaterials } from "#ui/entities/material/model/store.ts";
const { knowledge, loading } = storeToRefs(useMaterials());
import { useQuestions } from "#ui/entities/question/model/store.ts";
const { projectCards } = storeToRefs(useQuestions());
const { questionById } = useQuestions();
import PageHeading from "#ui/shared/ui/PageHeading.vue";
import QuestionCard from "#ui/features/study-discussion/index.ts";
import RatingButtons from "#ui/features/manage-repeat/index.ts";
import StudyLinks from "#ui/entities/question/ui/StudyLinks.vue";
const route = useRoute(),
  router = useRouter(),
  revealed = ref(false);
const { filter, kind, index } = toRefs(practiceState);
const selected = computed(() => {
  const question = questionById(route.query.question);
  return question && !isTestingTask(question) ? question : undefined;
});
const advanced = computed(() =>
  selected.value
    ? selected.value.codingRole === "advanced"
    : route.query.level === "advanced",
);
const practiceLocation = computed(() => ({
  path: "/practice",
  query: advanced.value ? { level: "advanced" } : {},
}));
const pool = computed(() =>
  knowledge.value.questions.filter(
    (q) =>
      !isTestingTask(q) && (q.codingRole === "advanced") === advanced.value,
  ),
);
watch(
  advanced,
  (value) => {
    const level = value ? "advanced" : "standard";
    if (practiceState.level === level) return;
    practiceState.level = level;
    filter.value = value ? "mixed" : "route";
    kind.value = "all";
    index.value = 0;
    revealed.value = false;
  },
  { immediate: true },
);
watch(
  () => [route.query.question, route.query.level, knowledge.value],
  () => {
    revealed.value = false;
    const q = selected.value;
    if (q) {
      filter.value = advanced.value
        ? "mixed"
        : q.source === "projects"
          ? "projects"
          : knowledge.value.route.includes(q.id)
            ? "route"
            : q.category;
      kind.value = "all";
    } else if (!advanced.value && route.query.category === "projects") {
      filter.value = "projects";
      kind.value = "all";
      index.value = 0;
    }
  },
  { immediate: true },
);
const categories = computed(() =>
  [...new Set(pool.value.map((q) => q.category))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  ),
);
const list = computed(() => {
  let qs =
    filter.value === "route"
      ? knowledge.value.route
          .map((id) => pool.value.find((q) => q.id === id))
          .filter((q) => q !== undefined)
      : filter.value === "projects"
        ? projectCards.value
        : filter.value === "mixed"
          ? pool.value
          : pool.value.filter((q) => q.category === filter.value);
  return kind.value === "all" ? qs : qs.filter((q) => q.kind === kind.value);
});
const current = computed(() =>
  route.query.question
    ? selected.value
    : list.value[index.value % Math.max(1, list.value.length)],
);
function changeFilter() {
  history.value = [];
  index.value = 0;
  revealed.value = false;
  if (route.query.question) void router.replace(practiceLocation.value);
}
const position = computed(() =>
  route.query.question
    ? list.value.findIndex((q) => q.id === selected.value?.id)
    : index.value % Math.max(1, list.value.length),
);
const history = ref<number[]>([]);
watch(
  () => list.value.map((q) => q.id).join("\n"),
  () => {
    history.value = [];
  },
);
const canPrevious = computed(
  () => history.value.length > 0 || position.value > 0,
);
function moveTo(value: number) {
  revealed.value = false;
  index.value = value;
  if (route.query.question) void router.push(practiceLocation.value);
}
function previous() {
  moveTo(history.value.pop() ?? Math.max(0, position.value - 1));
}
function next(random = false) {
  const count = list.value.length;
  if (!count) return;
  history.value.push(position.value);
  const step =
    random && count > 1 ? 1 + Math.floor(Math.random() * (count - 1)) : 1;
  moveTo((position.value + step) % count);
}
</script>
<template>
  <PageHeading title="Практика" />
  <nav class="practice-sections" aria-label="Разделы практики">
    <RouterLink to="/practice" :aria-current="!advanced ? 'page' : undefined"
      >Основная практика</RouterLink
    >
    <RouterLink
      :to="{ path: '/practice', query: { level: 'advanced' } }"
      :aria-current="advanced ? 'page' : undefined"
      >Дополнительная практика</RouterLink
    >
  </nav>
  <div class="platform-filters">
    <label
      >Направление<select
        id="practiceCategory"
        v-model="filter"
        @change="changeFilter"
      >
        <option value="mixed">Все темы</option>
        <option v-if="!advanced" value="route">
          Основной маршрут · {{ knowledge.route.length }} пунктов
        </option>
        <option
          v-for="category in categories"
          :key="category"
          :value="category"
        >
          {{ category }}
        </option>
        <option v-if="!advanced" value="projects">
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
    <div class="platform-actions question-navigation">
      <button
        data-action="previous-question"
        :disabled="!canPrevious"
        @click="previous"
      >
        ← Предыдущий вопрос
      </button>
      <button
        :disabled="revealed"
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
    <QuestionCard :question="current" :revealed="revealed">
      <template v-if="revealed"
        ><RatingButtons :id="current.id" /><StudyLinks :question="current"
      /></template>
    </QuestionCard>
  </template>
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
<style scoped>
.practice-sections {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 24px;
}
.practice-sections a {
  padding: 10px 0;
  border-bottom: 2px solid transparent;
  text-decoration: none;
  color: var(--muted);
}
.practice-sections a[aria-current="page"] {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
</style>
