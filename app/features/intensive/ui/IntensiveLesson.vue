<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { onBeforeRouteLeave } from "vue-router";
import type { IntensiveLesson } from "#domain/intensive/contracts.ts";
import type {
  LessonProgress,
  ProgressInput,
} from "#ui/features/intensive/api/intensive.ts";
import QuestionCard from "#ui/entities/question/ui/QuestionCard.vue";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";

const props = defineProps<{
  lesson: IntensiveLesson;
  savedProgress?: LessonProgress;
  busy: boolean;
  save: (progress: ProgressInput) => Promise<boolean>;
  addRepeat: (text: string) => Promise<boolean>;
}>();
defineEmits<{ next: [] }>();
const progress = reactive<ProgressInput>({
  status: "pending",
  step: "answer",
  drafts: {},
  notes: "",
});
const questionIndex = ref(0);
const revealed = ref(false);
const dirty = ref(false);
const repeatText = ref("");
const saved = ref(false);
const saveFailed = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
const recallQuestions = computed(() =>
  props.lesson.questions.filter(
    (question) => !["practice", "design"].includes(question.kind),
  ),
);
const practiceQuestions = computed(() =>
  props.lesson.questions.filter((question) =>
    ["practice", "design"].includes(question.kind),
  ),
);
const visibleQuestions = computed(() =>
  progress.step === "practice"
    ? practiceQuestions.value
    : recallQuestions.value,
);
const current = computed(() => visibleQuestions.value[questionIndex.value]);
const steps = computed(() => [
  ...(recallQuestions.value.length
    ? [{ id: "answer" as const, title: "Ответ" }]
    : []),
  { id: "reading" as const, title: "Разбор" },
  ...(practiceQuestions.value.length
    ? [{ id: "practice" as const, title: "Практика" }]
    : []),
  { id: "result" as const, title: "Итог" },
]);
const stageIndex = computed(() =>
  steps.value.findIndex((stage) => stage.id === progress.step),
);
watch(
  () => props.lesson.id,
  () => {
    const initial = props.savedProgress;
    progress.status = initial?.status || "pending";
    progress.step =
      initial?.step || (recallQuestions.value.length ? "answer" : "reading");
    progress.drafts = { ...(initial?.drafts || {}) };
    progress.notes = initial?.notes || "";
    progress.outcome = initial?.outcome;
    progress.questionId = initial?.questionId;
    questionIndex.value = Math.max(
      0,
      visibleQuestions.value.findIndex(
        (question) => question.id === initial?.questionId,
      ),
    );
    revealed.value = false;
    dirty.value = false;
    saved.value = false;
    saveFailed.value = false;
    repeatText.value = "";
  },
  { immediate: true },
);

async function persist() {
  clearTimeout(timer);
  if (!dirty.value) return true;
  const input = { ...progress, drafts: { ...progress.drafts } };
  const written = JSON.stringify(input);
  const success = await props.save(input);
  saveFailed.value = !success;
  if (
    success &&
    JSON.stringify({ ...progress, drafts: { ...progress.drafts } }) === written
  ) {
    dirty.value = false;
    saved.value = true;
  }
  return success;
}
function changed() {
  if (progress.status === "pending") progress.status = "in-progress";
  if (current.value) progress.questionId = current.value.id;
  dirty.value = true;
  saved.value = false;
  saveFailed.value = false;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void persist();
  }, 650);
}
async function go(step: ProgressInput["step"]) {
  if (!(await persist())) return;
  progress.step = step;
  questionIndex.value = 0;
  progress.questionId = visibleQuestions.value[0]?.id;
  if (progress.status === "pending") progress.status = "in-progress";
  dirty.value = true;
  if (!(await persist())) return;
  revealed.value = false;
}
async function changeQuestion(offset: number) {
  if (!(await persist())) return;
  questionIndex.value += offset;
  progress.questionId = current.value?.id;
  if (progress.status === "pending") progress.status = "in-progress";
  dirty.value = true;
  await persist();
  revealed.value = false;
}
async function complete() {
  progress.status = "done";
  dirty.value = true;
  if (!(await persist())) return;
  if (repeatText.value.trim()) {
    if (!(await props.addRepeat(repeatText.value.trim()))) return;
    repeatText.value = "";
  }
}
onBeforeRouteLeave(async () => await persist());
function protectDraft(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}
onMounted(() => window.addEventListener("beforeunload", protectDraft));
onBeforeUnmount(() => {
  clearTimeout(timer);
  window.removeEventListener("beforeunload", protectDraft);
});
defineExpose({ persist });
</script>

<template>
  <section class="intensive-lesson">
    <div class="platform-card intensive-lesson-header">
      <p class="platform-meta">
        {{ lesson.kind === "project" ? "Разбор проекта" : "Изучение темы" }}
      </p>
      <h2>{{ lesson.title }}</h2>
      <nav class="intensive-steps" aria-label="Этапы занятия">
        <button
          v-for="stage in steps"
          :key="stage.id"
          :aria-current="progress.step === stage.id ? 'step' : undefined"
          :disabled="busy"
          @click="go(stage.id)"
        >
          {{ stage.title }}
        </button>
      </nav>
    </div>

    <template v-if="progress.step === 'answer' || progress.step === 'practice'">
      <div v-if="current" class="intensive-question">
        <div class="intensive-question-toolbar">
          <span>{{ questionIndex + 1 }} из {{ visibleQuestions.length }}</span>
          <div class="platform-actions">
            <button
              :disabled="busy || questionIndex === 0"
              aria-label="Предыдущий вопрос занятия"
              @click="changeQuestion(-1)"
            >
              ← Назад
            </button>
            <button
              :disabled="busy || questionIndex >= visibleQuestions.length - 1"
              aria-label="Следующий вопрос занятия"
              @click="changeQuestion(1)"
            >
              Следующий →
            </button>
          </div>
        </div>
        <QuestionCard
          :key="current.id"
          :question="current"
          :revealed="revealed"
        >
          <button v-if="!revealed" @click="revealed = true">
            Показать разбор ответа
          </button>
        </QuestionCard>
        <details
          class="platform-card intensive-draft"
          :open="!!progress.drafts[current.id]"
        >
          <summary>Записать ответ</summary>
          <label :for="`intensive-answer-${current.id}`"
            >Ответ или решение</label
          >
          <textarea
            :id="`intensive-answer-${current.id}`"
            v-model="progress.drafts[current.id]"
            rows="6"
            @input="changed"
            @blur="persist"
          />
        </details>
      </div>
    </template>

    <section
      v-else-if="progress.step === 'reading'"
      class="platform-card intensive-reading"
    >
      <RouterLink class="intensive-source-link" :to="lesson.reading.href"
        >{{ lesson.reading.title }} ↗</RouterLink
      >
      <MarkdownContent
        :text="lesson.reading.markdown"
        :source-id="lesson.noteId"
        :follow-heading="false"
      />
      <details v-if="recallQuestions.length">
        <summary>Ответы на вопросы · {{ recallQuestions.length }}</summary>
        <QuestionCard
          v-for="question in recallQuestions"
          :key="question.id"
          :question="question"
          revealed
        />
      </details>
    </section>

    <form
      v-else
      class="platform-card intensive-result"
      @submit.prevent="complete"
    >
      <h3>Что получилось?</h3>
      <fieldset :disabled="busy">
        <legend class="visually-hidden">Результат занятия</legend>
        <label class="intensive-option"
          ><input
            v-model="progress.outcome"
            type="radio"
            value="read"
            required
            @change="changed"
          /><span>Разобрался в материале</span></label
        >
        <label class="intensive-option"
          ><input
            v-model="progress.outcome"
            type="radio"
            value="assisted"
            @change="changed"
          /><span>Объяснил с помощью</span></label
        >
        <label class="intensive-option"
          ><input
            v-model="progress.outcome"
            type="radio"
            value="independent"
            @change="changed"
          /><span>Объяснил самостоятельно</span></label
        >
        <label class="intensive-option"
          ><input
            v-model="progress.outcome"
            type="radio"
            value="applied"
            @change="changed"
          /><span>Применил в задаче</span></label
        >
      </fieldset>
      <label for="intensive-notes">Заметки к занятию</label>
      <textarea
        id="intensive-notes"
        v-model="progress.notes"
        rows="3"
        @input="changed"
        @blur="persist"
      />
      <label for="intensive-tomorrow">Добавить вопрос на завтра</label>
      <input
        id="intensive-tomorrow"
        v-model="repeatText"
        placeholder="Необязательно"
        maxlength="2000"
      />
      <div class="platform-actions">
        <button
          class="primary"
          type="submit"
          :disabled="busy || !progress.outcome"
        >
          {{
            progress.status === "done"
              ? "Сохранить результат"
              : "Завершить занятие"
          }}
        </button>
        <button
          v-if="props.savedProgress?.status === 'done'"
          type="button"
          :disabled="busy"
          @click="$emit('next')"
        >
          Следующее занятие →
        </button>
      </div>
      <p v-if="props.savedProgress?.status === 'done'" role="status">
        Занятие завершено.
      </p>
    </form>

    <div class="intensive-bottom-actions">
      <div class="platform-actions">
        <button
          v-if="stageIndex > 0"
          :disabled="busy"
          @click="go(steps[stageIndex - 1]!.id)"
        >
          Назад
        </button>
        <button
          v-if="stageIndex < steps.length - 1"
          class="primary"
          :disabled="busy"
          @click="go(steps[stageIndex + 1]!.id)"
        >
          {{
            steps[stageIndex + 1]!.id === "reading"
              ? "Открыть разбор"
              : steps[stageIndex + 1]!.id === "practice"
                ? "К практике"
                : "К итогу"
          }}
          →
        </button>
      </div>
      <span class="intensive-save-status" aria-live="polite">{{
        saveFailed
          ? "Изменения не сохранены"
          : dirty
            ? "Сохраняем…"
            : saved
              ? "Сохранено"
              : ""
      }}</span>
      <button v-if="saveFailed" :disabled="busy" @click="persist">
        Повторить сохранение
      </button>
    </div>
  </section>
</template>
