<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  progress,
  sessions,
  knowledge,
  loading,
  weakQuestions,
  setSession,
  startDaily,
  startFull,
} from "../app/store";
import {
  localDate,
  availableFollowups,
  openFollowup,
  advanceQuestion,
} from "../progress/engine.js";
import { kindLabel } from "../shared/presentation";
import { link } from "../app/router";
import PageHeading from "../shared/PageHeading.vue";
import QuestionCard from "../shared/QuestionCard.vue";
import RatingButtons from "../shared/RatingButtons.vue";
import StudyLinks from "../shared/StudyLinks.vue";
const route = useRoute(),
  router = useRouter(),
  date = ref(localDate());
const today = computed(() => progress.value.daily[date.value]);
const session = computed(() =>
  sessions.value.find((s) => s.id === route.query.session),
);
const current = computed(
  () =>
    session.value?.snapshots[session.value.questionIds[session.value.index]],
);
const reviewed = computed(
  () =>
    !!(
      session.value &&
      current.value &&
      session.value.kind === "daily" &&
      session.value.reviewed?.includes(current.value.id)
    ),
);
const pending = computed(() =>
  sessions.value.filter((s) => !s.finished && s.id !== today.value?.id),
);
const completed = computed(() =>
  sessions.value
    .filter((s) => s.finished && s.id !== today.value?.id)
    .sort((a, b) => b.date.localeCompare(a.date)),
);
function start(kind: "daily" | "full") {
  const id = kind === "daily" ? startDaily() : startFull();
  if (id) void router.push(link("interview", { session: id }));
}
function move(action: "next" | "skip" | "followup") {
  if (!session.value) return;
  const next =
    action === "followup"
      ? openFollowup(session.value)
      : advanceQuestion(session.value, action === "skip");
  if (next !== session.value && setSession(next))
    document.getElementById("platformMain")?.focus();
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
    <PageHeading
      title="Пробное интервью"
      description="Один вопрос за раз. В ежедневной тренировке проверяйте ответ сразу; в полном интервью разбор откроется в конце."
    />
    <section class="platform-card daily-card">
      <div class="platform-meta">
        {{
          new Date().toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
          })
        }}
        · 20–40 минут
      </div>
      <h2>Сегодняшнее интервью</h2>
      <p>
        11–12 вопросов по Vue, TypeScript, JavaScript, инженерным темам и вашим
        проектам или рабочему опыту. В течение дня вопросы остаются теми же.
      </p>
      <button
        class="primary"
        data-action="daily"
        :disabled="!today && (loading || !knowledge.questions.length)"
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
    <div class="platform-grid">
      <section class="platform-card">
        <div class="platform-meta">60–90 минут</div>
        <h2>Полное интервью</h2>
        <p>
          До 20 вопросов: основной стек, задачи, проектирование, Trajectory,
          Inbox Point, коммерческий опыт и поведенческие вопросы.
        </p>
        <button
          data-action="full"
          :disabled="loading || !knowledge.questions.length"
          @click="start('full')"
        >
          Начать полное интервью
        </button>
      </section>
      <section class="platform-card">
        <h2>Свободная практика</h2>
        <p>
          Выберите направление, основной маршрут или задачи. Открывайте ответ
          после самостоятельной попытки.
        </p>
        <RouterLink class="platform-button secondary" to="/practice"
          >Выбрать вопросы</RouterLink
        >
      </section>
      <section class="platform-card">
        <h2>Повторить</h2>
        <p>
          {{
            weakQuestions.length
              ? `Вопросов с затруднениями: ${weakQuestions.length}. Вернитесь к ним и проверьте себя снова.`
              : "Здесь появятся вопросы с отметками «Частично» и «Не смог ответить»."
          }}
        </p>
        <RouterLink class="platform-button secondary" to="/repeat"
          >К повторению</RouterLink
        >
      </section>
    </div>
    <section v-if="pending.length">
      <h2>Незавершённые интервью</h2>
      <RouterLink
        v-for="s in pending"
        :key="s.id"
        class="platform-list-row"
        :to="link('interview', { session: s.id })"
        ><span
          ><strong
            >{{ s.kind === "daily" ? "Ежедневное" : "Полное" }} интервью ·
            {{ s.date }}</strong
          ><small
            >Вопрос {{ s.index + 1 }} из {{ s.questionIds.length }}</small
          ></span
        ><span>Продолжить →</span></RouterLink
      >
    </section>
    <details v-if="completed.length" class="platform-card">
      <summary>Завершённые интервью · {{ completed.length }}</summary>
      <RouterLink
        v-for="s in completed"
        :key="s.id"
        class="platform-list-row"
        :to="link('interview', { session: s.id })"
        >{{ s.kind === "daily" ? "Ежедневное" : "Полное" }} интервью ·
        {{ s.date }}<span>Разбор →</span></RouterLink
      >
    </details>
  </template>
  <template v-else-if="!session"
    ><PageHeading title="Интервью не найдено" /><RouterLink to="/interview"
      >К сегодняшнему интервью</RouterLink
    ></template
  >
  <template v-else-if="session.finished">
    <PageHeading
      title="Разбор интервью"
      description="Оцените каждый ответ самостоятельно. Частичные и неудачные ответы попадут в повторение."
    /><RouterLink class="platform-back" to="/interview"
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
      <QuestionCard :question="session.snapshots[id]" revealed /><RatingButtons
        :id="id"
        :session-id="session.id"
      /><StudyLinks :question="session.snapshots[id]" />
    </section>
  </template>
  <template v-else-if="current">
    <PageHeading
      :title="
        session.kind === 'daily' ? 'Сегодняшнее интервью' : 'Полное интервью'
      "
    />
    <div class="platform-session-bar">
      <span
        >{{ kindLabel(current) }} · {{ session.index + 1 }} из
        {{ session.questionIds.length }}</span
      ><span
        >После этого осталось
        {{ session.questionIds.length - session.index - 1 }}</span
      >
    </div>
    <QuestionCard
      :key="current.id + ':' + (session.followupIndex || 0)"
      :question="current"
      :followup="session.followupIndex"
      :revealed="reviewed"
    />
    <template v-if="session.kind === 'daily'"
      ><template v-if="reviewed"
        ><RatingButtons :id="current.id" :session-id="session.id" /><StudyLinks
          :question="current" /></template
      ><button v-else data-action="session-review" @click="review">
        Проверить ответ
      </button></template
    >
    <div class="platform-actions">
      <button class="primary" data-action="session-next" @click="move('next')">
        {{
          session.index === session.questionIds.length - 1
            ? "Завершить интервью"
            : "Следующий вопрос"
        }}</button
      ><button
        v-if="availableFollowups(session).length"
        data-action="session-followup"
        @click="move('followup')"
      >
        Уточняющий вопрос</button
      ><button data-action="session-skip" @click="move('skip')">
        Пропустить вопрос</button
      ><RouterLink to="/interview">Продолжить позже</RouterLink>
    </div>
    <p class="platform-muted">
      Уточнения необязательны:
      {{ session.kind === "daily" ? "не больше одного" : "не больше двух" }} к
      основной теме.
      {{
        session.kind === "daily"
          ? "После самостоятельной попытки можно проверить ответ и открыть материал."
          : "Ответы доступны после завершения."
      }}
      Положение в интервью сохраняется после каждого шага.
    </p>
  </template>
</template>
