<script setup lang="ts">
import MaterialLoadState from "#ui/entities/material/ui/MaterialLoadState.vue";
import { canLeaveVoice } from "#ui/features/voice-input/index.ts";
import { storeToRefs } from "pinia";

import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
import { useSettings } from "#ui/entities/preparation/model/settings.ts";
const instanceSettings = useSettings();
const { progress, sessions, saving, loadError } = storeToRefs(usePreparation());
import { useMaterials } from "#ui/entities/material/model/store.ts";
const { knowledge, loading } = storeToRefs(useMaterials());
import { useQuestions } from "#ui/entities/question/model/store.ts";
const { weakQuestions } = storeToRefs(useQuestions());
import { useInterview } from "#ui/features/interview-session/model/store.ts";
const { setSession, startDaily, startFull } = useInterview();

import {
  localDate,
  dailyKey,
  availableFollowups,
  openedFollowups,
  openFollowup,
  advanceQuestion,
  previousQuestion,
  finishInterview,
} from "#domain/interview/engine.ts";
import { kindLabel } from "#ui/entities/question/lib/presentation.ts";
import { link } from "#ui/shared/lib/navigation.ts";
import PageHeading from "#ui/shared/ui/PageHeading.vue";
import QuestionCard from "#ui/features/study-discussion/index.ts";
import {
  interviewFormats,
  formatInfo,
  type InterviewFormat,
} from "#domain/interview/formats.ts";
import type { Interview } from "#domain/interview/state.ts";
import RatingButtons from "#ui/features/manage-repeat/index.ts";
import StudyLinks from "#ui/entities/question/ui/StudyLinks.vue";
import { followupQuestion } from "#domain/knowledge/followup.ts";
const route = useRoute(),
  router = useRouter(),
  date = ref(localDate());
// Keep this cached interview intact while another application section is active.
const sessionId = ref(route.query.session);
watch(
  () => route.fullPath,
  () => {
    if (route.path === "/interview") sessionId.value = route.query.session;
  },
);
const format = ref<InterviewFormat>("mixed");
function sessionTitle(value: Interview) {
  return value.kind === "daily"
    ? "Ежедневное интервью"
    : !value.format || value.format === "mixed"
      ? "Полное интервью"
      : formatInfo(value.format).title;
}
const today = computed(
  () =>
    progress.value.daily[
      dailyKey(date.value, instanceSettings.settings.profile)
    ],
);
const session = computed(() =>
  sessions.value.find((s) => s.id === sessionId.value),
);
const expandedResult = ref<string | null>(null);
watch(
  () => session.value?.id,
  () => {
    expandedResult.value = null;
  },
);
async function toggleResult(id: string, event: Event) {
  if (!canLeaveVoice()) return;
  const button = event.currentTarget as HTMLButtonElement;
  expandedResult.value = expandedResult.value === id ? null : id;
  await nextTick();
  if (expandedResult.value !== id) return;
  const heading = document
    .getElementById(button.getAttribute("aria-controls")!)
    ?.querySelector(".question-card h2")
    ?.getBoundingClientRect();
  if (heading && (heading.top < 0 || heading.bottom > window.innerHeight))
    button.scrollIntoView({ block: "start", behavior: "instant" });
}
function resultStatus(value: Interview, id: string) {
  const labels = {
    done: "Ответил уверенно",
    partial: "Частично",
    again: "Не смог ответить",
  };
  const rating = value.ratings[id];
  return [
    value.skipped.includes(id) ? "Пропущен" : "",
    rating
      ? labels[rating]
      : value.reviewed?.includes(id)
        ? "Ответ просмотрен"
        : "Без оценки",
  ]
    .filter(Boolean)
    .join(" · ");
}
const current = computed(
  () =>
    session.value?.snapshots[session.value.questionIds[session.value.index]],
);
const answeredFollowups = computed(() => {
  if (!session.value || !current.value) return [];
  const latest = knowledge.value.questions.find(
    (question) => question.id === current.value?.id,
  );
  return availableFollowups(session.value).filter(
    (index) =>
      followupQuestion(current.value!, index + 1, latest)?.availableAnswer,
  );
});
const reviewed = computed(
  () =>
    !!(
      session.value &&
      current.value &&
      session.value.reviewed?.includes(current.value.id)
    ),
);
async function start(kind: "daily" | "full") {
  const id = await (kind === "daily" ? startDaily() : startFull(format.value));
  if (id) void router.push(link("interview", { session: id }));
}
async function finish(value: Interview) {
  if (!canLeaveVoice()) return;
  if (!(await setSession(finishInterview(value)))) return;
  await nextTick();
  document.getElementById("platformMain")?.focus();
}
async function move(
  action: "next" | "skip" | "followup" | "previous",
  stageIndex?: number,
) {
  if (!canLeaveVoice()) return;
  if (!session.value) return;
  const next =
    action === "previous"
      ? previousQuestion(session.value)
      : action === "followup"
        ? openFollowup(
            session.value,
            stageIndex ??
              answeredFollowups.value[0] ??
              openedFollowups(session.value).at(-1),
          )
        : advanceQuestion(session.value, action === "skip");
  if (next !== session.value) await setSession(next);
}
function review() {
  if (!canLeaveVoice()) return;
  if (!session.value || !current.value) return;
  setSession({
    ...session.value,
    reviewed: [
      ...new Set([...(session.value.reviewed || []), current.value.id]),
    ],
  });
}
function refreshDate() {
  date.value = localDate();
}
onMounted(() => {
  window.addEventListener("focus", refreshDate);
  document.addEventListener("visibilitychange", refreshDate);
});
onUnmounted(() => {
  window.removeEventListener("focus", refreshDate);
  document.removeEventListener("visibilitychange", refreshDate);
});
watch(() => route.fullPath, refreshDate);
</script>
<template>
  <MaterialLoadState compact />
  <template v-if="!sessionId">
    <PageHeading title="Пробное интервью" />
    <section class="platform-card daily-card">
      <div class="platform-meta">
        {{
          new Date().toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
          })
        }}
      </div>
      <h2>Ежедневное интервью</h2>
      <p>
        11–12 вопросов по
        {{ instanceSettings.settings.profile === "react" ? "React" : "Vue" }},
        TypeScript, JavaScript и инженерным темам.
      </p>
      <button
        class="primary"
        data-action="daily"
        :disabled="
          saving ||
          !!loadError ||
          (!today && (loading || !knowledge.questions.length))
        "
        @click="
          today
            ? router.push(link('interview', { session: today.id }))
            : start('daily')
        "
      >
        {{
          loading && !today
            ? "Подключаем материалы…"
            : today?.finished
              ? "Открыть разбор"
              : today
                ? "Продолжить интервью"
                : "Начать интервью"
        }}
      </button>
    </section>
    <section class="interview-setup" aria-labelledby="fullInterviewHeading">
      <h2 id="fullInterviewHeading">Полное интервью</h2>
      <fieldset class="interview-formats">
        <legend class="platform-search-label">Формат интервью</legend>
        <label
          v-for="item in interviewFormats"
          :key="item.id"
          class="interview-format"
          :class="{ 'is-selected': format === item.id }"
        >
          <input
            v-model="format"
            type="radio"
            name="interview-format"
            :value="item.id"
            :aria-labelledby="'format-title-' + item.id"
            :aria-describedby="'format-description-' + item.id"
          />
          <span class="interview-format-content">
            <strong :id="'format-title-' + item.id">{{ item.title }}</strong>
            <span
              :id="'format-description-' + item.id"
              class="interview-format-description"
              >{{ item.description }}</span
            >
          </span>
        </label>
      </fieldset>
      <div class="interview-start">
        <button
          class="primary"
          data-action="full"
          :disabled="
            saving || !!loadError || loading || !knowledge.questions.length
          "
          @click="start('full')"
        >
          {{ format === "mixed" ? "Начать полное интервью" : "Начать раунд" }}
        </button>
      </div>
    </section>
    <div class="platform-grid">
      <section class="platform-card">
        <h2>Свободная практика</h2>
        <RouterLink class="platform-button secondary" to="/practice"
          >Выбрать вопросы</RouterLink
        >
      </section>
      <section class="platform-card">
        <h2>Повторить</h2>
        <p>
          {{
            weakQuestions.length
              ? `Вопросов с затруднениями: ${weakQuestions.length}`
              : "Вопросов для повторения пока нет"
          }}
        </p>
        <RouterLink class="platform-button secondary" to="/repeat"
          >К повторению</RouterLink
        >
      </section>
    </div>
  </template>
  <template v-else-if="!session"
    ><PageHeading
      :title="
        loadError ? 'Не удалось загрузить интервью' : 'Интервью не найдено'
      "
    /><RouterLink to="/interview">К интервью</RouterLink></template
  >
  <template v-else-if="session.finished">
    <PageHeading title="Разбор интервью" /><RouterLink
      class="platform-back"
      to="/interview"
      >← Все интервью</RouterLink
    >
    <section
      v-for="(id, i) in session.questionIds"
      :key="session.id + ':' + id"
      class="platform-result interview-result"
    >
      <h2 class="interview-result-heading">
        <button
          :id="'result-toggle-' + i"
          class="interview-result-toggle"
          data-action="result-toggle"
          :aria-expanded="expandedResult === id"
          :aria-controls="'result-panel-' + i"
          @click="toggleResult(id, $event)"
        >
          <span class="interview-result-number">{{ i + 1 }}</span>
          <span class="interview-result-label">
            <span>{{ session.snapshots[id].title }}</span>
            <small>{{ resultStatus(session, id) }}</small>
          </span>
          <span aria-hidden="true">{{
            expandedResult === id ? "−" : "+"
          }}</span>
        </button>
      </h2>
      <div
        v-show="expandedResult === id"
        :id="'result-panel-' + i"
        role="region"
        :aria-labelledby="'result-toggle-' + i"
      >
        <KeepAlive>
          <QuestionCard
            v-if="expandedResult === id"
            :question="session.snapshots[id]"
            :session-id="session.id"
            revealed
          >
            <template #materials>
              <StudyLinks :question="session.snapshots[id]" variant="list" />
            </template>
          </QuestionCard>
        </KeepAlive>
        <template v-if="expandedResult === id">
          <RatingButtons :id="id" :session-id="session.id" />
        </template>
      </div>
    </section>
  </template>
  <template v-else-if="current">
    <div class="interview-session-heading">
      <PageHeading :title="sessionTitle(session)" />
      <nav class="interview-session-tools" aria-label="Действия интервью">
        <RouterLink to="/interview">Продолжить позже</RouterLink>
        <button
          v-if="session.index < session.questionIds.length - 1"
          :disabled="saving"
          data-action="session-finish"
          @click="finish(session)"
        >
          Завершить интервью
        </button>
      </nav>
    </div>
    <div class="platform-session-bar">
      <span
        >{{
          current.codingRole === "short"
            ? "Короткая задача"
            : current.codingRole === "main"
              ? "Основная задача"
              : kindLabel(current)
        }}
        · {{ session.index + 1 }} из {{ session.questionIds.length }}</span
      ><span
        >После этого осталось
        {{ session.questionIds.length - session.index - 1 }}</span
      >
    </div>
    <QuestionCard
      :question="current"
      :session-id="session.id"
      :followup="session.followupIndex"
      :revealed="reviewed"
    >
      <template #materials>
        <StudyLinks :question="current" variant="list" />
      </template>
      <template #actions="{ revealed: stageRevealed }">
        <div class="platform-actions interview-answer-actions">
          <button
            v-if="!session.followupIndex && !reviewed"
            class="primary"
            data-action="session-review"
            :disabled="saving"
            @click="review"
          >
            Проверить ответ
          </button>
          <RatingButtons
            v-if="reviewed && !session.followupIndex"
            :id="current.id"
            :session-id="session.id"
            compact
          />
          <button
            :class="stageRevealed ? 'primary' : 'interview-text-action'"
            data-action="session-next"
            :disabled="saving"
            @click="move('next')"
          >
            {{
              session.index === session.questionIds.length - 1
                ? "Завершить интервью"
                : "Следующий вопрос"
            }}
          </button>
        </div>
        <div
          v-if="
            current.roundFormat === 'coding' &&
            current.codingRole &&
            current.followups?.length
          "
          class="coding-stages"
        >
          <div class="platform-actions">
            <button
              v-for="(title, index) in current.followups"
              :key="title"
              data-action="session-followup"
              :aria-pressed="session.followupIndex === index + 1"
              :disabled="saving || session.followupIndex === index + 1"
              @click="move('followup', index)"
            >
              Усложнение {{ index + 1 }}: {{ title }}
            </button>
          </div>
        </div>
        <div class="platform-actions interview-secondary-actions">
          <button
            v-if="session.index > 0 || session.followupIndex"
            data-action="session-previous"
            :disabled="
              saving || (session.index === 0 && !session.followupIndex)
            "
            @click="move('previous')"
          >
            {{
              session.followupIndex
                ? "К основному вопросу"
                : "Предыдущий вопрос"
            }}
          </button>
          <button
            v-if="
              !(current.roundFormat === 'coding' && current.codingRole) &&
              (answeredFollowups.length ||
                (!session.followupIndex && openedFollowups(session).length))
            "
            data-action="session-followup"
            :disabled="
              saving || (!!session.followupIndex && !answeredFollowups.length)
            "
            @click="move('followup')"
          >
            {{
              session.followupIndex ? "Другое уточнение" : "Уточняющий вопрос"
            }}</button
          ><button
            data-action="session-skip"
            :disabled="saving"
            @click="move('skip')"
          >
            {{
              current.roundFormat === "coding" &&
              current.codingRole &&
              session.followupIndex
                ? "Пропустить усложнение"
                : "Пропустить вопрос"
            }}
          </button>
        </div>
      </template>
    </QuestionCard>
  </template>
</template>
<style scoped>
.interview-result {
  margin-block: 0;
  padding-bottom: 0;
}
.interview-result-heading {
  margin: 0;
  font-size: 16px;
}
.interview-result-toggle {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  line-height: 1.5;
}
.interview-result-toggle:hover {
  background: #f3f6fc;
}
.interview-result-number {
  flex: 0 0 24px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
.interview-result-label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.interview-result-label small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}
.interview-answer-actions {
  margin-block: 24px 12px;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.interview-answer-actions :deep(.platform-ratings) {
  margin: 0;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0;
}
.interview-answer-actions :deep(.platform-ratings button) {
  flex: 0 1 auto;
  padding: 8px 10px;
  font-size: 13px;
  border-radius: 0;
  margin-left: -1px;
}
.interview-answer-actions :deep(.platform-ratings button:first-child) {
  border-radius: 6px 0 0 6px;
  margin-left: 0;
}
.interview-answer-actions :deep(.platform-ratings button:last-child) {
  border-radius: 0 6px 6px 0;
}
.interview-secondary-actions {
  gap: 8px;
  margin-block: 12px 0;
  font-size: 14px;
}
.interview-secondary-actions button,
.interview-text-action,
.coding-stages button,
.interview-session-tools button {
  padding: 9px 12px;
  border: 1px solid transparent;
  background: var(--surface);
  color: #45546b;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  text-decoration: none;
}
.interview-secondary-actions button:hover:not(:disabled),
.interview-text-action:hover:not(:disabled),
.coding-stages button:hover:not(:disabled),
.interview-session-tools button:hover:not(:disabled) {
  background: #e9eef6;
  border-color: #d4deec;
  color: var(--ink);
  text-decoration: none;
}
.coding-stages .platform-actions {
  display: grid;
  justify-items: start;
  gap: 6px;
  font-size: 14px;
}
.interview-session-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
}
.interview-session-tools a {
  text-decoration: none;
}
.interview-session-tools a:hover {
  text-decoration: underline;
}
.interview-setup {
  padding-block: 30px;
  border-top: 1px solid var(--line);
  margin-top: 32px;
}
.interview-setup h2 {
  margin-bottom: 22px;
}
.interview-formats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.interview-format {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 18px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: white;
  cursor: pointer;
  min-width: 0;
}
.interview-format:hover {
  border-color: #819cce;
}
.interview-format.is-selected {
  border-color: var(--accent);
  background: #edf3ff;
  box-shadow: inset 0 0 0 1px var(--accent);
}
.interview-format:focus-within {
  outline: 3px solid #98b6ec;
  outline-offset: 3px;
}
.interview-format input {
  accent-color: var(--accent);
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  margin: 4px 0 0;
}
.interview-format-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.interview-format strong {
  font-size: 16px;
  line-height: 1.4;
}

.interview-format-description {
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted);
}
.interview-start {
  margin-top: 20px;
}
.interview-session-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.interview-session-heading :deep(.page-heading) {
  margin-bottom: 0;
}
.interview-session-heading > button {
  flex-shrink: 0;
}
@media (max-width: 1200px) {
  .interview-formats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .interview-answer-actions {
    gap: 10px;
  }
  .interview-answer-actions > button {
    flex: 0 1 auto;
    font-size: 13px;
  }
  .interview-answer-actions > button.primary {
    flex: 1 1 auto;
    padding-inline: 12px;
  }
  .interview-secondary-actions {
    gap: 8px;
    justify-content: flex-start;
  }
  .interview-secondary-actions > button {
    flex: 0 1 auto;
    padding-inline: 8px;
    font-size: 12px;
  }
  .interview-formats {
    grid-template-columns: 1fr;
  }
  .interview-format {
    padding: 16px;
  }
  .interview-session-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }
  .interview-start button {
    width: 100%;
  }
}
</style>
