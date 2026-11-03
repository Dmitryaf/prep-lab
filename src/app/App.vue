<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import {
  loading,
  loadError,
  message,
  unavailable,
  weakQuestions,
  questions,
  knowledge,
  sessions,
  fetchKnowledge,
} from "./store";
import { topics, projects } from "../projects/catalog";
import { link } from "./router";
import QuestionList from "../shared/QuestionList.vue";
import PageHeading from "../shared/PageHeading.vue";
const route = useRoute(),
  search = ref(""),
  searchInput = ref<HTMLInputElement>();
const active = computed(
  () =>
    route.path === "/interview" &&
    sessions.value.some((s) => s.id === route.query.session && !s.finished),
);
const term = computed(() => search.value.trim().toLocaleLowerCase("ru"));
const foundQuestions = computed(() =>
  questions.value.filter((q) =>
    [q.title, q.category, q.prompt]
      .join(" ")
      .toLocaleLowerCase("ru")
      .includes(term.value),
  ),
);
const foundNotes = computed(() =>
  knowledge.value.notes.filter((n) =>
    [n.title, n.markdown]
      .join(" ")
      .toLocaleLowerCase("ru")
      .includes(term.value),
  ),
);
const foundTopics = computed(() =>
  topics.filter((t) =>
    [t.title, t.summary, projects[t.project].name]
      .join(" ")
      .toLocaleLowerCase("ru")
      .includes(term.value),
  ),
);
const nav = [
  ["interview", "Интервью"],
  ["practice", "Практика"],
  ["themes", "Темы"],
  ["projects", "Проекты"],
  ["repeat", "Повторить"],
];
function keydown(event: KeyboardEvent) {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName || "",
    ) &&
    !active.value
  ) {
    event.preventDefault();
    searchInput.value?.focus();
  }
  if (event.key === "Escape") search.value = "";
}
watch(
  () => route.fullPath,
  async () => {
    search.value = "";
    await nextTick();
    document.getElementById("platformMain")?.focus({preventScroll:true});
  },
);
onMounted(() => {
  void fetchKnowledge();
  document.addEventListener("keydown", keydown);
});
onUnmounted(() => document.removeEventListener("keydown", keydown));
</script>
<template>
  <div class="platform-shell">
    <header class="platform-header">
      <RouterLink class="platform-brand" to="/interview"
        ><svg class="platform-logo" aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M7 7h18v18H7zM7 16h18M16 7v18" stroke="currentColor" stroke-width="1.5"/><path d="M7 25l9-9 9-9" stroke="currentColor" stroke-width="3"/><circle cx="7" cy="25" r="3" fill="currentColor"/><circle cx="25" cy="7" r="3" fill="currentColor"/></svg
        ><span
          >Frontend Lab<span class="platform-brand-sub"
            >Подготовка · frontend</span
          ></span
        ></RouterLink
      >
      <nav id="platformNav" aria-label="Основные разделы">
        <RouterLink
          v-for="[id, label] in nav"
          :key="id"
          :to="'/' + id"
          :aria-current="route.path === '/' + id ? 'page' : undefined"
          >{{ label
          }}<span v-if="id === 'repeat' && weakQuestions.length">{{
            weakQuestions.length
          }}</span></RouterLink
        >
      </nav>
      <div class="platform-tools">
        <label class="platform-search-label" for="platformSearch"
          >Найти материал</label
        ><input
          id="platformSearch"
          ref="searchInput"
          v-model="search"
          type="search"
          :disabled="active"
          placeholder="Найти материал…"
          autocomplete="off"
        />
      </div>
    </header>
    <div class="platform-workspace">
      <div id="platformStatus" role="status" aria-live="polite">
        <p
          v-for="text in [loadError, unavailable, message].filter(Boolean)"
          :key="text"
          class="platform-notice"
        >
          {{ text }}
        </p>
      </div>
      <main id="platformMain" tabindex="-1">
        <template v-if="term && !active"
          ><PageHeading
            title="Результаты поиска"
            :description="`«${search}» · найдено ${foundQuestions.length + foundNotes.length + foundTopics.length}`"
          />
          <h2 v-if="foundQuestions.length">Вопросы и задачи</h2>
          <QuestionList :items="foundQuestions.slice(0, 60)" />
          <h2 v-if="foundNotes.length">Материалы</h2>
          <RouterLink
            v-for="n in foundNotes.slice(0, 60)"
            :key="n.id"
            class="platform-list-row"
            :to="link('themes', { note: n.id })"
            ><span
              >{{ n.title }}<small>{{ n.category }}</small></span
            ><span>→</span></RouterLink
          >
          <h2 v-if="foundTopics.length">Проекты и их темы</h2>
          <RouterLink
            v-for="t in foundTopics"
            :key="t.id"
            class="platform-list-row"
            :to="link('projects', { projectTopic: t.id })"
            >{{ projects[t.project].name }} · {{ t.title
            }}<span>→</span></RouterLink
          >
          <p
            v-if="
              !foundQuestions.length &&
              !foundNotes.length &&
              !foundTopics.length
            "
          >
            Совпадений нет. Попробуйте другое слово или название технологии.
          </p></template
        >
        <div v-show="!term || active"><RouterView /></div>
      </main>
    </div>
  </div>
</template>
