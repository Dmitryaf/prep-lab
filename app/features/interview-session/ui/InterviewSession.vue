<script setup lang="ts">
import { storeToRefs } from "pinia";

import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
import { useSettings } from "#ui/entities/preparation/model/settings.ts";
const instanceSettings = useSettings();
const { progress, sessions, saving } = storeToRefs(usePreparation());
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
  sessions.value.find((s) => s.id === route.query.session),
);
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
  if (!(await setSession(finishInterview(value)))) return;
  await nextTick();
  document.getElementById("platformMain")?.focus();
}
async function move(
  action: "next" | "skip" | "followup" | "previous",
  stageIndex?: number,
) {
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
  <template v-if="!route.query.session">
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
          saving || (!today && (loading || !knowledge.questions.length))
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
          :disabled="saving || loading || !knowledge.questions.length"
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
    ><PageHeading title="Интервью не найдено" /><RouterLink to="/interview"
      >К интервью</RouterLink
    ></template
  >
  <template v-else-if="session.finished">
    <PageHeading title="Разбор интервью" /><RouterLink
      class="platform-back"
      to="/interview"
      >← Все интервью</RouterLink
    >
    <section
      v-for="(id, i) in session.questionIds"
      :key="id"
      class="platform-result"
    >
      <div class="platform-meta">
        {{ i + 1 }} из {{ session.questionIds.length
        }}{{ session.skipped.includes(id) ? " · Пропущен" : "" }}
      </div>
      <QuestionCard
        :question="session.snapshots[id]"
        :session-id="session.id"
        revealed
      />
      <RatingButtons :id="id" :session-id="session.id" /><StudyLinks
        :question="session.snapshots[id]"
      />
    </section>
  </template>
  <template v-else-if="current">
    <div class="interview-session-heading">
      <PageHeading :title="sessionTitle(session)" />
      <button
        v-if="session.index < session.questionIds.length - 1"
        :disabled="saving"
        data-action="session-finish"
        @click="finish(session)"
      >
        Завершить интервью
      </button>
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
    <div class="platform-actions">
      <button
        data-action="session-previous"
        :disabled="saving || (session.index === 0 && !session.followupIndex)"
        @click="move('previous')"
      >
        {{
          session.followupIndex ? "К основному вопросу" : "Предыдущий вопрос"
        }}
      </button>
      <button
        class="primary"
        data-action="session-next"
        :disabled="saving"
        @click="move('next')"
      >
        {{
          session.index === session.questionIds.length - 1
            ? "Завершить интервью"
            : "Следующий вопрос"
        }}</button
      ><button
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
        }}</button
      ><RouterLink to="/interview">Продолжить позже</RouterLink>
    </div>
    <QuestionCard
      :question="current"
      :session-id="session.id"
      :followup="session.followupIndex"
      :revealed="reviewed"
    >
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
      <template v-if="reviewed && !session.followupIndex"
        ><RatingButtons :id="current.id" :session-id="session.id" /><StudyLinks
          :question="current" /></template
      ><button
        v-else-if="!session.followupIndex"
        data-action="session-review"
        :disabled="saving"
        @click="review"
      >
        Проверить ответ
      </button>
    </QuestionCard>
  </template>
</template>
<style scoped>
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
