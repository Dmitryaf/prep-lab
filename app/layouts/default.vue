<script setup lang="ts">
import { canLeaveVoice } from "#ui/features/voice-input/index.ts";
import { storeToRefs } from "pinia";

import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
import { useSettings } from "#ui/entities/preparation/model/settings.ts";
const instanceSettings = useSettings();
const preparation = usePreparation();
const { loadError, sessions, ready, saving } = storeToRefs(preparation);
const retryingPreparation = ref(false);
import { useNotices } from "#ui/shared/model/notices.ts";
const { message } = storeToRefs(useNotices());
import { useMaterials } from "#ui/entities/material/model/store.ts";
const {
  unavailable,
  knowledge,
  loading: materialsLoading,
} = storeToRefs(useMaterials());
const { fetchKnowledge } = useMaterials();
import { useQuestions } from "#ui/entities/question/model/store.ts";
const { weakQuestions, questions } = storeToRefs(useQuestions());

import { useProjectCatalog } from "#ui/entities/project/model/catalog.ts";
const projectCatalog = useProjectCatalog();
const {
  topics,
  projects,
  ready: projectsReady,
  error: projectError,
  loading: projectsLoading,
} = storeToRefs(projectCatalog);
import { link } from "#ui/shared/lib/navigation.ts";
import QuestionList from "#ui/entities/question/ui/QuestionList.vue";
import LoadingState from "#ui/shared/ui/LoadingState.vue";
const route = useRoute(),
  search = ref(""),
  searchInput = ref<HTMLInputElement>();
const searchDialog = ref<HTMLDialogElement>();
const searchTrigger = ref<HTMLButtonElement>();
let searchOpener: HTMLElement | null = null;
let previousOverflow: string | undefined;
const navigationOpen = ref(false);
const navigationToggle = ref<HTMLButtonElement>();
let interaction = 0,
  navigationInteraction = 0,
  navigationHadSearch = false;
const removeNavigationGuard = useRouter().beforeEach(() => {
  navigationInteraction = interaction;
  navigationHadSearch = !!searchDialog.value?.open;
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
    q.title.toLocaleLowerCase("ru").includes(term.value),
  ),
);
const foundNotes = computed(() =>
  knowledge.value.notes.filter((n) =>
    n.title.toLocaleLowerCase("ru").includes(term.value),
  ),
);
const foundTopics = computed(() =>
  topics.value.filter((t) =>
    t.title.toLocaleLowerCase("ru").includes(term.value),
  ),
);
const nav = [
  ["intensive", "Интенсив"],
  ["interview", "Интервью"],
  ["practice", "Практика"],
  ["themes", "Темы"],
  ["projects", "Проекты"],
  ["sources", "Свои материалы"],
  ["repeat", "Повторить"],
  ["prompts", "Промпты"],
];
function openSearch() {
  if (
    active.value ||
    !canLeaveVoice() ||
    !searchDialog.value ||
    searchDialog.value.open
  )
    return;
  searchOpener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : (searchTrigger.value ?? null);
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  searchDialog.value.showModal();
  searchInput.value?.focus();
}
function closeSearch(restoreFocus = true) {
  if (!searchDialog.value?.open) return;
  searchDialog.value.close();
  search.value = "";
  if (previousOverflow !== undefined) {
    document.body.style.overflow = previousOverflow;
    previousOverflow = undefined;
  }
  if (restoreFocus && searchOpener?.isConnected)
    searchOpener.focus({ preventScroll: true });
}
function backdropClick(event: MouseEvent) {
  const anchor = (event.target as Element).closest("a[href]");
  if (
    anchor instanceof HTMLAnchorElement &&
    anchor.href === location.href &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    closeSearch(false);
    document.getElementById("platformMain")?.focus({ preventScroll: true });
    return;
  }
  if (event.target !== searchDialog.value) return;
  const bounds = searchDialog.value.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    closeSearch();
}
async function retryCatalogs() {
  await Promise.all([
    unavailable.value ? fetchKnowledge() : Promise.resolve(),
    projectError.value ? projectCatalog.initialize() : Promise.resolve(),
  ]);
}
async function retryPreparation() {
  retryingPreparation.value = true;
  try {
    await preparation.initialize();
  } finally {
    retryingPreparation.value = false;
  }
}
function keydown(event: KeyboardEvent) {
  interaction++;
  if (event.key === "Escape" && searchDialog.value?.open) {
    event.preventDefault();
    closeSearch();
    return;
  }
  if (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !searchDialog.value?.open &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName || "",
    ) &&
    !(
      document.activeElement instanceof HTMLElement &&
      document.activeElement.isContentEditable
    ) &&
    !active.value
  ) {
    event.preventDefault();
    openSearch();
  }
  if (
    event.key === "Escape" &&
    !searchDialog.value?.open &&
    navigationOpen.value
  ) {
    navigationOpen.value = false;
    if (navigationToggle.value?.getClientRects().length)
      navigationToggle.value.focus();
  }
}
async function changeProfile(event: Event) {
  if (!canLeaveVoice()) {
    (event.target as HTMLSelectElement).value =
      instanceSettings.settings.profile;
    return;
  }
  const profile = (event.target as HTMLSelectElement).value;
  if (profile === "vue" || profile === "react")
    await instanceSettings.save({ profile });
}
watch(
  () => route.fullPath,
  () => {
    // A search opened after navigation started belongs to the new interaction.
    // Do not close it when the earlier navigation finishes rendering.
    if (navigationHadSearch) closeSearch(false);
    navigationOpen.value = false;
    if (navigationHadSearch || interaction === navigationInteraction) {
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
  closeSearch(false);
  removeNavigationGuard();
});
</script>
<template>
  <div class="platform-shell">
    <header
      class="platform-header"
      :class="{
        'is-interview': route.path === '/interview',
        'is-navigation-open': navigationOpen,
      }"
    >
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
          >Prep Lab<span class="platform-brand-sub"
            >Подготовка к собеседованию</span
          ></span
        ></RouterLink
      >
      <button
        v-if="route.path === '/interview'"
        ref="navigationToggle"
        class="platform-navigation-toggle"
        :aria-expanded="navigationOpen"
        aria-controls="platformNav platformProfile platformTools"
        @click="navigationOpen = !navigationOpen"
      >
        Меню
      </button>
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
      <div
        v-if="route.path !== '/intensive'"
        id="platformProfile"
        class="platform-profile"
      >
        <label for="preparationProfile">Стек интервью</label>
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
      <div id="platformTools" class="platform-tools">
        <button
          ref="searchTrigger"
          class="material-search-trigger"
          :disabled="active"
          aria-haspopup="dialog"
          @click="openSearch"
        >
          Найти материал…
        </button>
      </div>
    </header>
    <div class="platform-workspace">
      <div id="platformStatus" role="status" aria-live="polite">
        <p v-if="loadError" class="platform-notice">
          {{ loadError }}
          <button type="button" @click="retryPreparation">
            Повторить загрузку
          </button>
        </p>
        <LoadingState
          v-if="retryingPreparation"
          compact
          label="Загружаем данные экземпляра…"
        />
        <p
          v-for="text in [
            route.path === '/projects' ? '' : projectError,
            message,
          ].filter(Boolean)"
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
        <LoadingState
          v-if="!ready || !projectsReady || !instanceSettings.ready"
          label="Загружаем данные экземпляра…"
        />
        <div v-else><slot /></div>
      </main>
    </div>
    <dialog
      ref="searchDialog"
      class="material-search-dialog"
      aria-labelledby="materialSearchTitle"
      @cancel.prevent="closeSearch()"
      @click="backdropClick"
    >
      <div class="material-search-heading">
        <h2 id="materialSearchTitle">Поиск материалов</h2>
        <button type="button" aria-label="Закрыть поиск" @click="closeSearch()">
          ×
        </button>
      </div>
      <label class="platform-search-label" for="platformSearch"
        >Поиск материалов</label
      >
      <input
        id="platformSearch"
        ref="searchInput"
        v-model="search"
        type="search"
        placeholder="Название материала, вопроса или темы"
        autocomplete="off"
      />
      <LoadingState
        v-if="materialsLoading || projectsLoading"
        compact
        label="Загружаем материалы для поиска…"
      />
      <div
        v-if="unavailable || projectError"
        class="material-search-error"
        role="alert"
      >
        <p>Часть материалов недоступна. Результаты могут быть неполными.</p>
        <button
          type="button"
          :disabled="materialsLoading || projectsLoading"
          @click="retryCatalogs"
        >
          Повторить загрузку
        </button>
      </div>
      <div v-if="term" aria-live="polite">
        <p>
          {{
            materialsLoading || projectsLoading || unavailable || projectError
              ? "Предварительно найдено:"
              : "Найдено:"
          }}
          {{ foundQuestions.length + foundNotes.length + foundTopics.length }}
        </p>
        <h3 v-if="foundQuestions.length">Вопросы и задачи</h3>
        <QuestionList :items="foundQuestions.slice(0, 60)" />
        <h3 v-if="foundNotes.length">Материалы</h3>
        <RouterLink
          v-for="n in foundNotes.slice(0, 60)"
          :key="n.id"
          class="platform-list-row"
          :to="link('themes', { note: n.id })"
          ><span
            >{{ n.title }}<small>{{ n.category }}</small></span
          ><span aria-hidden="true">→</span></RouterLink
        >
        <h3 v-if="foundTopics.length">Проекты и их темы</h3>
        <RouterLink
          v-for="t in foundTopics"
          :key="t.id"
          class="platform-list-row"
          :to="link('projects', { projectTopic: t.id })"
          >{{ projects[t.project].name }} · {{ t.title
          }}<span aria-hidden="true">→</span></RouterLink
        >
        <p
          v-if="
            !materialsLoading &&
            !projectsLoading &&
            !unavailable &&
            !projectError &&
            !foundQuestions.length &&
            !foundNotes.length &&
            !foundTopics.length
          "
        >
          Совпадений нет. Попробуйте другое слово из заголовка.
        </p>
      </div>
      <p v-else>Введите название или часть заголовка.</p>
    </dialog>
  </div>
</template>
<style scoped>
.material-search-trigger {
  width: 100%;
  text-align: left;
  color: var(--muted);
  background: white;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 10px 12px;
  font-size: 14px;
}
.material-search-dialog {
  width: min(720px, calc(100% - 32px));
  max-height: min(80vh, 800px);
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--ink);
  box-shadow: 0 20px 60px #14213d40;
  overflow: auto;
}
.material-search-dialog::backdrop {
  background: #14213d80;
}
.material-search-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.material-search-heading h2 {
  margin: 0;
}
.material-search-heading button {
  font-size: 24px;
  line-height: 1;
}
.material-search-error {
  margin-top: 16px;
}
.material-search-dialog h3 {
  margin-top: 24px;
}
</style>
