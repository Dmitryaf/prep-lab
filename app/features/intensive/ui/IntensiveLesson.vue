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
import { StudyDiscussion } from "#ui/features/study-discussion/index.ts";
import { getIntensiveContext } from "#ui/features/intensive/api/intensive.ts";
import type { IntensiveContext as Context } from "#domain/intensive/context.ts";
import IntensiveContext from "./IntensiveContext.vue";
import QuestionCard from "#ui/entities/question/ui/QuestionCard.vue";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
import VoiceInput, { canLeaveVoice } from "#ui/features/voice-input/index.ts";

const props = defineProps<{
  lesson: IntensiveLesson;
  savedProgress?: LessonProgress;
  busy: boolean;
  save: (progress: ProgressInput) => Promise<boolean>;
  title?: string;
  owner?: string;
  addRepeat: (text: string) => Promise<boolean>;
}>();
defineEmits<{ next: []; story: [] }>();
const context = ref<Context>();
const contextError = ref("");
async function loadContext() {
  const id = props.lesson.id;
  try {
    const loaded = await getIntensiveContext(id);
    if (id === props.lesson.id) {
      context.value = loaded;
      contextError.value = "";
    }
  } catch {
    if (id === props.lesson.id)
      contextError.value = "Не удалось загрузить материалы занятия.";
  }
}
onMounted(loadContext);
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
  ["check", "reading"].includes(progress.step)
    ? props.lesson.questions
    : progress.step === "practice"
      ? practiceQuestions.value
      : recallQuestions.value,
);
const current = computed(() => visibleQuestions.value[questionIndex.value]);
const steps = computed(() => [
  ...(recallQuestions.value.length
    ? [{ id: "answer" as const, title: "Ответить" }]
    : []),
  { id: "reading" as const, title: "Изучить разбор" },
  ...(practiceQuestions.value.length
    ? [{ id: "practice" as const, title: "Практика" }]
    : []),
  ...(props.lesson.questions.length
    ? [{ id: "check" as const, title: "Проверить себя" }]
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
    progress.assessments = structuredClone(initial?.assessments || {});
    progress.checks = { ...(initial?.checks || {}) };
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
  const input: ProgressInput = JSON.parse(JSON.stringify(progress));
  const written = JSON.stringify(input);
  const success = await props.save(input);
  saveFailed.value = !success;
  if (success && JSON.stringify(progress) === written) {
    dirty.value = false;
    saved.value = true;
  }
  if (success && dirty.value) return persist();
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
  if (!canLeaveVoice()) return;
  if (!(await persist())) return;
  const questionId = progress.questionId;
  progress.step = step;
  questionIndex.value = Math.max(
    0,
    visibleQuestions.value.findIndex((question) => question.id === questionId),
  );
  progress.questionId = current.value?.id;
  if (progress.status === "pending") progress.status = "in-progress";
  dirty.value = true;
  if (!(await persist())) return;
  revealed.value = false;
}
async function changeQuestion(offset: number) {
  if (!canLeaveVoice()) return;
  if (!(await persist())) return;
  questionIndex.value += offset;
  progress.questionId = current.value?.id;
  if (progress.status === "pending") progress.status = "in-progress";
  dirty.value = true;
  await persist();
  revealed.value = false;
}
const assessment = computed(() =>
  current.value ? progress.assessments?.[current.value.id] : undefined,
);
function assess(
  level: "gap" | "assisted" | "independent",
  note = assessment.value?.note || "",
) {
  if (!current.value) return;
  progress.assessments ||= {};
  progress.assessments[current.value.id] = { level, note };
  changed();
}
const answerDraft = computed({
  get: () =>
    current.value
      ? (progress.step === "check"
          ? progress.checks?.[current.value.id]
          : progress.drafts[current.value.id]) || ""
      : "",
  set: (value: string) => {
    if (!current.value) return;
    if (progress.step === "check") {
      progress.checks ||= {};
      progress.checks[current.value.id] = value;
    } else progress.drafts[current.value.id] = value;
  },
});
const gaps = computed(() =>
  props.lesson.questions.filter(
    (question) =>
      progress.assessments?.[question.id] &&
      progress.assessments[question.id]!.level !== "independent",
  ),
);
const discussionContext = computed(() =>
  JSON.stringify({
    question: current.value,
    answer: answerDraft.value,
    gap: assessment.value?.note,
    reading: props.lesson.reading.markdown.slice(0, 12000),
    code: context.value?.code
      .map((step) => ({
        title: step.title,
        explanation: step.explanation,
        code: step.preview?.text.slice(0, 4000),
      }))
      .slice(0, 4),
    instruction:
      "Помоги разобраться в конкретном затруднении. Сначала уточни рассуждение, затем объясни нужную часть проекта. После разбора задай вопрос для самостоятельной проверки. Не придумывай детали реализации и личные достижения.",
  }),
);
async function revisit(id: string) {
  if (!canLeaveVoice()) return;
  if (!(await persist())) return;
  progress.questionId = id;
  await go("check");
}
async function complete() {
  if (!canLeaveVoice()) return;
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
      <p v-if="owner" class="intensive-muted">{{ owner }}</p>
      <h2 tabindex="-1">{{ title || lesson.title }}</h2>
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

    <template
      v-if="
        progress.step === 'answer' ||
        progress.step === 'practice' ||
        progress.step === 'check'
      "
    >
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
        <p v-if="progress.step === 'check'" class="platform-meta">
          Самостоятельный ответ
        </p>
        <QuestionCard
          :key="current.id"
          :question="current"
          :revealed="revealed"
          hide-approach
        >
          <button v-if="!revealed" @click="revealed = true">
            Показать разбор ответа
          </button>
        </QuestionCard>
        <VoiceInput
          v-model="answerDraft"
          label="Ответ или решение"
          placeholder="Напишите или надиктуйте ответ…"
          :rows="5"
          @changed="changed"
          @blur="persist"
        />
        <section class="platform-card intensive-assessment">
          <h3>Получилось объяснить?</h3>
          <div class="intensive-levels" role="group" aria-label="Оценка ответа">
            <button
              :aria-pressed="assessment?.level === 'gap'"
              @click="assess('gap')"
            >
              Нужно разобраться
            </button>
            <button
              :aria-pressed="assessment?.level === 'assisted'"
              @click="assess('assisted')"
            >
              С подсказкой
            </button>
            <button
              :aria-pressed="assessment?.level === 'independent'"
              @click="assess('independent')"
            >
              Самостоятельно
            </button>
          </div>
          <template v-if="assessment && assessment.level !== 'independent'">
            <label for="intensive-gap">В чём затруднение?</label>
            <textarea
              id="intensive-gap"
              :value="assessment.note"
              rows="2"
              maxlength="10000"
              @input="
                assess(
                  assessment.level,
                  ($event.target as HTMLTextAreaElement).value,
                )
              "
              @blur="persist"
            />
            <button :disabled="busy" @click="go('reading')">
              Разобрать этот вопрос
            </button>
          </template>
          <details
            v-if="
              progress.step === 'check' &&
              revealed &&
              progress.drafts[current.id]
            "
          >
            <summary>Мой первый ответ</summary>
            <MarkdownContent
              :text="progress.drafts[current.id]!"
              :follow-heading="false"
            />
          </details>
          <StudyDiscussion
            :key="current.id"
            :material-key="'intensive:' + lesson.id + ':' + current.id"
            :title="current.title"
            :context="discussionContext"
          />
        </section>
      </div>
    </template>

    <section
      v-else-if="progress.step === 'reading'"
      class="platform-card intensive-reading"
    >
      <section
        v-if="current && assessment && assessment.level !== 'independent'"
        class="intensive-focused-review"
      >
        <p v-if="assessment.note">{{ assessment.note }}</p>
        <QuestionCard :question="current" revealed hide-approach />
        <button class="primary" :disabled="busy" @click="go('check')">
          Ответить ещё раз без подсказки
        </button>
      </section>
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
          hide-approach
        />
      </details>
    </section>

    <form
      v-else
      class="platform-card intensive-result"
      @submit.prevent="complete"
    >
      <h3>Что получилось?</h3>
      <section v-if="gaps.length" class="intensive-open-gaps">
        <h4>Нужно разобраться</h4>
        <ul>
          <li v-for="question in gaps" :key="question.id">
            <button
              type="button"
              :disabled="busy"
              @click="revisit(question.id)"
            >
              {{ question.title }}
            </button>
            <p>{{ progress.assessments?.[question.id]?.note }}</p>
          </li>
        </ul>
      </section>
      <fieldset :disabled="busy">
        <legend class="visually-hidden">Результат занятия</legend>
        <label class="intensive-option"
          ><input
            v-model="progress.outcome"
            type="radio"
            value="gap"
            @change="changed"
          /><span>Остались вопросы</span></label
        >
        <label class="intensive-option"
          ><input
            v-model="progress.outcome"
            type="radio"
            value="read"
            required
            @change="changed"
          /><span>Изучил материал</span></label
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
      <button
        v-if="lesson.projectId"
        type="button"
        :disabled="busy"
        @click="$emit('story')"
      >
        Дополнить рассказ о проекте
      </button>
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

    <template v-if="progress.step === 'reading' || revealed">
      <IntensiveContext v-if="context" :context="context" />
      <p v-if="contextError" role="alert">
        {{ contextError }}
        <button @click="loadContext">Загрузить материалы</button>
      </p>
    </template>
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
                : steps[stageIndex + 1]!.id === "check"
                  ? "Проверить себя"
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
