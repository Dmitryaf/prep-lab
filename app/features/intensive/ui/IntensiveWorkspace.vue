<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { IntensiveGoal } from "#domain/intensive/contracts.ts";
import { useIntensive } from "#ui/features/intensive/model/useIntensive.ts";
import { questionCount } from "#ui/features/intensive/model/presentation.ts";
import PageHeading from "#ui/shared/ui/PageHeading.vue";
import IntensiveSetup from "./IntensiveSetup.vue";
import IntensiveProgramEditor from "./IntensiveProgramEditor.vue";
import IntensiveLesson from "./IntensiveLesson.vue";
import IntensiveAssistant from "./IntensiveAssistant.vue";
import "./intensive.css";

const model = useIntensive();
const { snapshot, catalog, loading, pending, error } = model;
const view = ref<"setup" | "preview" | "study">("setup");
const activeId = ref("");
const lessonView = ref<InstanceType<typeof IntensiveLesson> | null>(null);
const plan = computed(() => snapshot.value?.state.plan);
const draft = computed(() => snapshot.value?.state.draft);
const progress = computed(() => snapshot.value?.state.progress || {});
const activeLesson = computed(() =>
  plan.value?.lessons.find((lesson) => lesson.id === activeId.value),
);
const completed = computed(
  () =>
    plan.value?.lessons.filter(
      (lesson) => progress.value[lesson.id]?.status === "done",
    ).length || 0,
);
const pendingLessons = computed(
  () =>
    plan.value?.lessons.filter(
      (lesson) => progress.value[lesson.id]?.status !== "done",
    ) || [],
);
const repeats = computed(() => snapshot.value?.state.tomorrow || []);
const selectedGoal = computed(() => draft.value?.goal || plan.value?.goal);
const busy = computed(() => pending.value > 0);

async function load() {
  await model.load();
  if (!snapshot.value) return;
  if (draft.value) view.value = "preview";
  else if (plan.value) view.value = "study";
  else view.value = "setup";
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
    plan.value?.lessons[0]?.id ||
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
  activeId.value =
    pendingLessons.value[0]?.id || plan.value?.lessons[0]?.id || "";
}
async function selectLesson(id: string) {
  if (lessonView.value && !(await lessonView.value.persist())) return;
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
    }))
  )
    return;
  activeId.value = id;
}
async function configure() {
  if (lessonView.value && !(await lessonView.value.persist())) return;
  await model.refreshCatalog();
  view.value = "setup";
}
async function nextLesson() {
  const lessons = plan.value?.lessons || [];
  const position = lessons.findIndex((lesson) => lesson.id === activeId.value);
  const next =
    lessons
      .slice(position + 1)
      .find((lesson) => progress.value[lesson.id]?.status !== "done") ||
    pendingLessons.value[0];
  if (next) await selectLesson(next.id);
  else await configure();
}
onMounted(load);
</script>

<template>
  <div class="intensive-workspace">
    <div class="intensive-page-heading">
      <PageHeading :title="view === 'study' ? 'Интенсив' : 'План подготовки'" />
      <button v-if="view === 'study'" :disabled="busy" @click="configure">
        Дополнить программу
      </button>
    </div>
    <div v-if="error" class="platform-card intensive-error" role="alert">
      <p>{{ error }}</p>
      <button :disabled="busy || loading" @click="load">Обновить данные</button>
    </div>
    <p v-if="loading" role="status">Загружаем программу…</p>
    <template v-else-if="snapshot">
      <IntensiveSetup
        v-if="view === 'setup'"
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
          <span
            >{{ completed }} из {{ plan.lessons.length }} занятий
            завершено</span
          >
        </div>
        <div class="intensive-study-grid">
          <IntensiveLesson
            ref="lessonView"
            :key="activeLesson.id"
            :lesson="activeLesson"
            :saved-progress="progress[activeLesson.id]"
            :busy="busy"
            :save="(input) => model.save(activeLesson!.id, input)"
            :add-repeat="(text) => model.repeat(activeLesson!.id, text)"
            @next="nextLesson"
          />
          <aside class="intensive-sidebar" aria-label="Программа подготовки">
            <section class="platform-card">
              <h2>Занятия</h2>
              <ol class="intensive-queue">
                <li v-for="lesson in plan.lessons" :key="lesson.id">
                  <button
                    :aria-current="lesson.id === activeId ? 'true' : undefined"
                    :disabled="busy"
                    @click="selectLesson(lesson.id)"
                  >
                    <span>{{ lesson.title }}</span
                    ><small>{{
                      progress[lesson.id]?.status === "done"
                        ? "Завершено"
                        : progress[lesson.id]?.status === "in-progress"
                          ? "Продолжить"
                          : lesson.questions.length
                            ? questionCount(lesson.questions.length)
                            : "Чтение"
                    }}</small>
                  </button>
                </li>
              </ol>
              <button
                class="intensive-more"
                :disabled="busy"
                @click="configure"
              >
                Ещё занятия
              </button>
            </section>
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
