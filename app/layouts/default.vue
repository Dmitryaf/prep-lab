<script setup lang="ts">
import { storeToRefs } from "pinia";

import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePreparation } from "../entities/preparation/model/store.ts";
import { useSettings } from "../entities/preparation/model/settings.ts";
const instanceSettings = useSettings();
const { loadError, sessions, ready, saving } = storeToRefs(usePreparation());
import { useNotices } from "../shared/model/notices.ts";
const { message } = storeToRefs(useNotices());
import { useMaterials } from "../entities/material/model/store.ts";
const { unavailable, knowledge } = storeToRefs(useMaterials());
const { fetchKnowledge } = useMaterials();
import { useQuestions } from "../entities/question/model/store.ts";
const { weakQuestions, questions } = storeToRefs(useQuestions());

import { useProjectCatalog } from "../entities/project/model/catalog.ts";
const projectCatalog = useProjectCatalog();
const {
  topics,
  projects,
  ready: projectsReady,
  error: projectError,
} = storeToRefs(projectCatalog);
import { link } from "../shared/lib/navigation.ts";
import QuestionList from "../entities/question/ui/QuestionList.vue";
import PageHeading from "../shared/ui/PageHeading.vue";
const route = useRoute(),
  search = ref(""),
  searchInput = ref<HTMLInputElement>();
let interaction = 0,
  navigationInteraction = 0;
const removeNavigationGuard = useRouter().beforeEach(() => {
  navigationInteraction = interaction;
});
const pointerdown = () => {
  interaction++;
};
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
  topics.value.filter((t) =>
    [t.title, t.summary, projects.value[t.project].name]
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
  interaction++;
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
async function changeProfile(event: Event) {
  const profile = (event.target as HTMLSelectElement).value;
  if (profile === "vue" || profile === "react")
    await instanceSettings.save({ profile });
}
watch(
  () => route.fullPath,
  () => {
    if (interaction === navigationInteraction) {
      search.value = "";
      document.getElementById("platformMain")?.focus({ preventScroll: true });
    }
  },
  { flush: "post" },
);
onMounted(() => {
  void projectCatalog.initialize();
  void instanceSettings.initialize();
  void fetchKnowledge();
  document.addEventListener("keydown", keydown);
  document.addEventListener("pointerdown", pointerdown);
});
onUnmounted(() => {
  document.removeEventListener("keydown", keydown);
  document.removeEventListener("pointerdown", pointerdown);
  removeNavigationGuard();
});
</script>
<template>
  <div class="platform-shell">
    <header class="platform-header">
      <RouterLink class="platform-brand" to="/interview"
        ><svg
          class="platform-logo"
          aria-hidden="true"
          viewBox="0 0 32 32"
          fill="none"
        >
          <path
            d="M7 7h18v18H7zM7 16h18M16 7v18"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path d="M7 25l9-9 9-9" stroke="currentColor" stroke-width="3" />
          <circle cx="7" cy="25" r="3" fill="currentColor" />
          <circle cx="25" cy="7" r="3" fill="currentColor" /></svg
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
      <div class="platform-profile">
        <label for="preparationProfile">Профиль подготовки</label>
        <select
          id="preparationProfile"
          :value="instanceSettings.settings.profile"
          :disabled="
            active || !instanceSettings.ready || instanceSettings.saving
          "
          @change="changeProfile"
        >
          <option value="vue">Vue</option>
          <option value="react">React</option>
        </select>
      </div>
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
          v-for="text in [loadError, projectError, unavailable, message].filter(
            Boolean,
          )"
          :key="text"
          class="platform-notice"
        >
          {{ text }}
        </p>
      </div>
      <main
        id="platformMain"
        tabindex="-1"
        :aria-busy="
          !ready ||
          !projectsReady ||
          !instanceSettings.ready ||
          instanceSettings.saving ||
          saving
        "
      >
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
        <p
          v-if="!ready || !projectsReady || !instanceSettings.ready"
          role="status"
        >
          Загружаем данные экземпляра…
        </p>
        <div v-else v-show="!term || active"><slot /></div>
      </main>
    </div>
  </div>
</template>
