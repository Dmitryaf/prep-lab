<script setup lang="ts">
import { canLeaveVoice } from "#ui/features/voice-input/index.ts";
import { computed, nextTick, onMounted, ref } from "vue";
import type { IntensiveGoal } from "#domain/intensive/contracts.ts";
import { useIntensive } from "#ui/features/intensive/model/useIntensive.ts";
import {
  activeLessons,
  lessonLocation,
  lessonGaps,
} from "#domain/intensive/navigation.ts";
import IntensiveNavigation from "./IntensiveNavigation.vue";
import IntensiveStory from "./IntensiveStory.vue";
import IntensivePlanSettings from "./IntensivePlanSettings.vue";
import LoadingState from "#ui/shared/ui/LoadingState.vue";
import PageHeading from "#ui/shared/ui/PageHeading.vue";
import IntensiveSetup from "./IntensiveSetup.vue";
import IntensiveProgramEditor from "./IntensiveProgramEditor.vue";
import IntensiveLesson from "./IntensiveLesson.vue";
import IntensiveAssistant from "./IntensiveAssistant.vue";
import "./intensive.css";

const model = useIntensive();
const {
  snapshot,
  catalog,
  loading,
  catalogLoading,
  catalogError,
  pending,
  error,
} = model;
const view = ref<"setup" | "preview" | "study" | "settings">("setup");
const activeId = ref("");
const storyProjectId = ref("");
const storyView = ref<InstanceType<typeof IntensiveStory> | null>(null);
const lessonView = ref<InstanceType<typeof IntensiveLesson> | null>(null);
const studyHost = ref<HTMLElement>();
const plan = computed(() => snapshot.value?.state.plan);
const lessons = computed(() => activeLessons(plan.value));
const draft = computed(() => snapshot.value?.state.draft);
const progress = computed(() => snapshot.value?.state.progress || {});
const activeLesson = computed(() =>
  plan.value?.lessons.find((lesson) => lesson.id === activeId.value),
);
const completed = computed(
  () =>
    lessons.value.filter(
      (lesson) => progress.value[lesson.id]?.status === "done",
    ).length || 0,
);
const pendingLessons = computed(
  () =>
    lessons.value.filter(
      (lesson) => progress.value[lesson.id]?.status !== "done",
    ) || [],
);
const repeats = computed(() => snapshot.value?.state.tomorrow || []);
const selectedGoal = computed(() => draft.value?.goal || plan.value?.goal);
const busy = computed(() => pending.value > 0);

async function load() {
  if (catalogLoading.value || !canLeaveVoice()) return;
  const initial = !snapshot.value;
  if (!(await model.load())) return;
  if (
    initial ||
    (view.value === "preview" && !draft.value) ||
    (["study", "settings"].includes(view.value) && !plan.value)
  ) {
    view.value = draft.value ? "preview" : plan.value ? "study" : "setup";
  }
  if (lessons.value.some((lesson) => lesson.id === activeId.value)) return;
  activeId.value =
    [...pendingLessons.value]
      .sort((a, b) =>
        (progress.value[b.id]?.updatedAt || "").localeCompare(
          progress.value[a.id]?.updatedAt || "",
        ),
      )
      .find((lesson) => progress.value[lesson.id]?.status === "in-progress")
      ?.id ||
    pendingLessons.value[0]?.id ||
    lessons.value[0]?.id ||
    "";
}
async function prepare(goal: IntensiveGoal) {
  if (await model.prepare(goal)) view.value = "preview";
}
async function propose(goal: IntensiveGoal, ids: string[]) {
  if (await model.propose(goal, ids)) view.value = "preview";
}
async function accept(ids: string[]) {
  if (!(await model.accept(ids))) return;
  view.value = "study";
  activeId.value = pendingLessons.value[0]?.id || lessons.value[0]?.id || "";
}
async function flush() {
  if (!canLeaveVoice()) return false;
  if (lessonView.value && !(await lessonView.value.persist())) return false;
  if (storyView.value && !(await storyView.value.persist())) return false;
  return true;
}
async function openStory(projectId: string) {
  if (!(await flush())) return;
  storyProjectId.value = projectId;
}
async function settings() {
  if (!(await flush())) return;
  view.value = "settings";
}
async function edit(goal: IntensiveGoal, ids: string[]) {
  if (!(await model.edit(goal, ids))) return;
  if (!ids.includes(activeId.value)) activeId.value = ids[0] || "";
  view.value = "study";
  storyProjectId.value = "";
}
async function selectLesson(id: string) {
  if (!(await flush())) return;
  const lesson = plan.value?.lessons.find((item) => item.id === id);
  if (!lesson) return;
  const existing = progress.value[id];
  if (
    !(await model.save(id, {
      status: existing?.status === "done" ? "done" : "in-progress",
      step:
        existing?.step ||
        (lesson.questions.some(
          (question) => !["practice", "design"].includes(question.kind),
        )
          ? "answer"
          : "reading"),
      drafts: existing?.drafts || {},
      notes: existing?.notes || "",
      outcome: existing?.outcome,
      questionId: existing?.questionId,
      assessments: existing?.assessments,
      checks: existing?.checks,
    }))
  )
    return;
  activeId.value = id;
  storyProjectId.value = "";
  await nextTick();
  if (window.matchMedia("(max-width: 850px)").matches) {
    const heading = studyHost.value?.querySelector<HTMLElement>(
      ".intensive-lesson-header h2",
    );
    heading?.scrollIntoView({ block: "start", behavior: "instant" });
    heading?.focus({ preventScroll: true });
  }
}
async function configure() {
  const currentView = lessonView.value || storyView.value;
  if (!(await flush())) return;
  if (!(await model.refreshCatalog())) return;
  if (
    view.value !== "study" ||
    currentView !== (lessonView.value || storyView.value) ||
    !(await flush())
  )
    return;
  view.value = "setup";
}
async function nextLesson() {
  const available = lessons.value;
  const position = available.findIndex(
    (lesson) => lesson.id === activeId.value,
  );
  const next =
    available
      .slice(position + 1)
      .find((lesson) => progress.value[lesson.id]?.status !== "done") ||
    pendingLessons.value[0];
  if (next) await selectLesson(next.id);
  else if (activeLesson.value?.projectId)
    await openStory(activeLesson.value.projectId);
}
onMounted(load);
</script>

<template>
  <div class="intensive-workspace">
    <div class="intensive-page-heading">
      <PageHeading :title="view === 'study' ? 'Интенсив' : 'План подготовки'" />
      <div v-if="view === 'study'" class="intensive-heading-actions">
        <button :disabled="busy" @click="settings">Настроить программу</button>
        <button
          :disabled="busy || loading || catalogLoading"
          @click="configure"
        >
          Добавить материалы
        </button>
      </div>
    </div>
    <div v-if="error" class="platform-card intensive-error" role="alert">
      <p>{{ error }}</p>
      <button :disabled="busy || loading || catalogLoading" @click="load">
        Обновить данные
      </button>
    </div>
    <LoadingState
      v-if="loading"
      :compact="!!snapshot"
      :label="snapshot ? 'Обновляем программу…' : 'Загружаем программу…'"
    />
    <LoadingState
      v-if="catalogLoading"
      compact
      label="Загружаем список материалов…"
    />
    <div
      v-if="view === 'study' && catalogError"
      class="platform-card intensive-error"
      role="alert"
    >
      <p>{{ catalogError }}</p>
      <button :disabled="busy || loading || catalogLoading" @click="configure">
        Повторить загрузку списка
      </button>
    </div>
    <template v-if="snapshot">
      <IntensivePlanSettings
        v-if="view === 'settings' && plan"
        :plan="plan"
        :busy="busy"
        @save="edit"
        @cancel="view = 'study'"
      />
      <IntensiveSetup
        v-else-if="view === 'setup'"
        :catalog="catalog"
        :initial="selectedGoal"
        :has-plan="!!plan"
        :busy="busy"
        @prepare="prepare"
        @cancel="view = 'study'"
      >
        <template #assistant="{ goal, valid }"
          ><IntensiveAssistant
            :goal="goal"
            :disabled="busy || !valid"
            @ordered="(ids) => propose(goal, ids)"
        /></template>
      </IntensiveSetup>
      <IntensiveProgramEditor
        v-else-if="view === 'preview' && draft"
        :key="draft.id"
        :draft="draft"
        :busy="busy"
        :existing-ids="plan?.lessons.map((lesson) => lesson.id) || []"
        @accept="accept"
        @back="view = 'setup'"
      />
      <template v-else-if="plan && activeLesson">
        <div class="intensive-plan-heading">
          <p>{{ plan.goal.title }}</p>
          <span>{{ completed }} из {{ lessons.length }} занятий завершено</span>
        </div>
        <p v-if="completed === lessons.length" class="platform-card">
          Все занятия программы пройдены.<span
            v-if="lessons.some((lesson) => lessonGaps(progress[lesson.id]))"
          >
            В программе остались вопросы для разбора.</span
          >
        </p>
        <div ref="studyHost" class="intensive-study-grid">
          <IntensiveStory
            v-if="storyProjectId"
            ref="storyView"
            :key="storyProjectId"
            :name="
              catalog.projects.find((project) => project.id === storyProjectId)
                ?.name || storyProjectId
            "
            :saved="snapshot.state.stories?.[storyProjectId]"
            :lessons="
              plan.lessons.filter(
                (lesson) => lesson.projectId === storyProjectId,
              )
            "
            :busy="busy"
            :save="(story) => model.story(storyProjectId, story)"
            @lesson="selectLesson"
          />
          <IntensiveLesson
            v-else
            ref="lessonView"
            :key="activeLesson.id"
            :lesson="activeLesson"
            :title="lessonLocation(activeLesson, catalog).title"
            :owner="
              lessonLocation(activeLesson, catalog).owner +
              ' · ' +
              lessonLocation(activeLesson, catalog).block
            "
            :saved-progress="progress[activeLesson.id]"
            :busy="busy"
            :save="(input) => model.save(activeLesson!.id, input)"
            :add-repeat="(text) => model.repeat(activeLesson!.id, text)"
            @next="nextLesson"
            @story="openStory(activeLesson.projectId!)"
          />
          <aside class="intensive-sidebar" aria-label="Программа подготовки">
            <IntensiveNavigation
              :lessons="lessons"
              :catalog="catalog"
              :progress="progress"
              :active-id="activeId"
              :busy="busy"
              @select="selectLesson"
              @story="openStory"
            />
            <details class="platform-card intensive-tomorrow">
              <summary>
                Завтра
                <span v-if="repeats.some((item) => !item.done)"
                  >· {{ repeats.filter((item) => !item.done).length }}</span
                >
              </summary>
              <p v-if="!repeats.length" class="intensive-muted">
                Здесь появятся вопросы, которые вы отложите для повторения.
              </p>
              <ul v-else>
                <li v-for="item in repeats" :key="item.id">
                  <label class="intensive-option"
                    ><input
                      type="checkbox"
                      :checked="item.done"
                      :disabled="busy"
                      @change="model.toggleRepeat(item.id, !item.done)"
                    /><span :class="{ 'intensive-repeat-done': item.done }">{{
                      item.text
                    }}</span></label
                  ><button
                    :disabled="busy"
                    class="intensive-text-button"
                    @click="selectLesson(item.lessonId)"
                  >
                    К занятию
                  </button>
                </li>
              </ul>
            </details>
          </aside>
        </div>
      </template>
    </template>
  </div>
</template>
