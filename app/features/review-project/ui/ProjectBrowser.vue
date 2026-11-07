<script setup lang="ts">
import PageHeading from "#ui/shared/ui/PageHeading.vue";
import TopicDetail from "./ProjectTopic.vue";
import ProjectMap from "./ProjectMap.vue";
import QuestionCard from "#ui/features/study-discussion/index.ts";
import RatingButtons from "#ui/features/manage-repeat/index.ts";
import StudyLinks from "#ui/entities/question/ui/StudyLinks.vue";
import { useProjectBrowser } from "#ui/features/review-project/model/useProjectBrowser.ts";
const {
  projects,
  topics,
  projectCards,
  progress,
  link,
  reviewSessions,
  route,
  project,
  mode,
  group,
  query,
  routeId,
  reviewScope,
  reviewFilter,
  reviewMode,
  reviewSession,
  reviewIndex,
  revealed,
  selected,
  projectTopics,
  groups,
  filtered,
  currentRoute,
  routeTopics,
  contextQuery,
  topicLink,
  readingTopics,
  position,
  closeTopic,
  reviews,
  reviewQuestion,
  selectProject,
  reviewNext,
  reviewPrevious,
} = useProjectBrowser();
</script>
<template>
  <template v-if="selected">
    <div class="reading-toolbar">
      <button
        class="platform-back"
        data-action="back-to-topics"
        @click="closeTopic"
      >
        ←
        {{
          mode === "overview"
            ? "К карте проекта"
            : mode === "map"
              ? "К маршруту"
              : "К списку тем"
        }}
      </button>
      <span class="reading-location"
        >{{ projects[selected.project].name }} <span aria-hidden="true">/</span>
        {{ selected.group }}</span
      >
      <span class="reading-position"
        >Тема {{ position + 1 }} из {{ readingTopics.length }}</span
      >
    </div>
    <nav class="reading-neighbours" aria-label="Соседние темы">
      <RouterLink
        v-if="position > 0"
        :to="topicLink(readingTopics[position - 1]!.id)"
        >←
        <span class="neighbour-title">{{
          readingTopics[position - 1]!.title
        }}</span
        ><span class="neighbour-label">Предыдущая тема</span></RouterLink
      ><span v-else />
      <RouterLink
        v-if="position >= 0 && position < readingTopics.length - 1"
        :to="topicLink(readingTopics[position + 1]!.id)"
        ><span class="neighbour-title">{{
          readingTopics[position + 1]!.title
        }}</span
        ><span class="neighbour-label">Следующая тема</span> →</RouterLink
      >
    </nav>
    <TopicDetail
      :key="selected.id"
      :topic="selected"
      :route-nodes="mode === 'map' ? currentRoute?.nodes : undefined"
    />
  </template>
  <template v-else-if="route.query.projectTopic">
    <PageHeading
      title="Тема не найдена"
      description="Возможно, ссылка устарела. Выберите тему из списка проекта."
    />
    <RouterLink :to="link('projects', contextQuery())"
      >К списку тем →</RouterLink
    >
  </template>
  <template v-else-if="!Object.keys(projects).length">
    <PageHeading title="Проекты" />
    <section class="platform-card">
      <h2>Добавьте свой проект</h2>
      <RouterLink :to="{ path: '/sources', query: { scenario: 'project' } }"
        >Подготовить разбор проекта</RouterLink
      >
      <p>Для разбора понадобятся описание проекта и код.</p>
    </section>
  </template>
  <template v-else>
    <div class="catalog-heading">
      <PageHeading title="Проекты" />
      <div class="platform-actions">
        <RouterLink
          class="platform-button secondary"
          :to="{ path: '/sources', query: { scenario: 'project' } }"
          >Добавить разбор проекта</RouterLink
        >
        <RouterLink
          class="platform-button secondary"
          data-action="project-practice"
          :to="link('practice', { category: 'projects' })"
          >Проекты и рабочий опыт ·
          {{ projectCards.length }} вопросов</RouterLink
        >
      </div>
    </div>
    <div class="platform-actions project-switch">
      <button
        v-for="p in projects"
        :key="p.id"
        data-action="project"
        :data-project="p.id"
        :aria-pressed="project === p.id"
        @click="selectProject(p.id)"
      >
        <span>{{ p.name }}</span>
        <small>{{ topics.filter((t) => t.project === p.id).length }} тем</small>
      </button>
    </div>
    <nav class="platform-actions" aria-label="Карта проектов">
      <button
        v-for="[id, label] in [
          ['overview', 'Карта'],
          ['map', 'Маршруты'],
          ['topics', 'Темы'],
          ['review', 'Повторение'],
        ]"
        :key="id"
        data-action="mode"
        :data-mode="id"
        :aria-pressed="mode === id"
        @click="
          mode = id;
          reviewIndex = 0;
          revealed = false;
        "
      >
        {{ label }}
      </button>
    </nav>
    <ProjectMap
      v-if="mode === 'overview' && projects[project]"
      :key="project"
      :project="projects[project]"
      :topics="projectTopics"
      :topic-link="topicLink"
    />
    <template v-else-if="mode === 'topics'"
      ><div class="platform-filters">
        <label
          >Раздел<select v-model="group" aria-label="Раздел">
            <option v-for="g in groups" :key="g">{{ g }}</option>
          </select></label
        ><label
          >Поиск по проекту<input
            id="inlineSearch"
            v-model="query"
            type="search"
            placeholder="Найти тему"
        /></label>
      </div>
      <div class="platform-meta">
        {{
          projectTopics.filter(
            (t) => progress.progress[t.id]?.status === "done",
          ).length
        }}/{{ projectTopics.length }} тем могу объяснить
      </div>
      <RouterLink
        v-for="t in filtered"
        :key="t.id"
        class="platform-list-row topic-row"
        :data-topic-id="t.id"
        :to="topicLink(t.id)"
        ><span
          ><strong>{{ t.title }}</strong
          ><small
            >{{ t.priority }} · {{ t.group }} ·
            {{
              progress.progress[t.id]?.status === "done"
                ? "✓ Могу объяснить"
                : progress.progress[t.id]?.status === "again"
                  ? "↻ Повторить"
                  : "Не проверено"
            }}</small
          ></span
        ><span>→</span></RouterLink
      >
      <p v-if="!filtered.length">
        Темы не найдены. Измените поиск или раздел.
      </p></template
    >
    <template v-else-if="mode === 'map'"
      ><div class="platform-filters">
        <label
          >Маршрут<select id="projectRoute" v-model="routeId">
            <option
              v-for="r in projects[project].routes"
              :key="r.id"
              :value="r.id"
            >
              {{ r.name }}
            </option>
          </select></label
        >
      </div>
      <h2>{{ currentRoute?.name }}</h2>
      <p>{{ currentRoute?.caption }}</p>
      <ol class="route-topics">
        <li v-for="t in routeTopics" :key="t.id">
          <RouterLink
            class="platform-list-row"
            :data-topic-id="t.id"
            :to="topicLink(t.id)"
            >{{ t.title }} →</RouterLink
          >
        </li>
      </ol></template
    >
    <template v-else>
      <div class="platform-filters">
        <label
          >Охват<select
            v-model="reviewScope"
            aria-label="Охват"
            @change="
              reviewIndex = 0;
              revealed = false;
            "
          >
            <option value="current">Текущий проект</option>
            <option value="both">Все проекты</option>
          </select></label
        ><label
          >Набор<select
            v-model="reviewFilter"
            aria-label="Набор"
            @change="
              reviewIndex = 0;
              revealed = false;
            "
          >
            <option value="priority">Сначала важное</option>
            <option value="again">Нужно повторить</option>
            <option value="all">Все вопросы</option>
            <option value="new">Ещё не проверены</option>
          </select></label
        ><label
          >Формат<select
            id="reviewMode"
            v-model="reviewMode"
            @change="
              reviewIndex = 0;
              revealed = false;
            "
          >
            <option value="full">Все вопросы</option>
            <option value="quick">Главный вопрос каждой темы</option>
          </select></label
        ><label
          >Сессия<select
            v-model="reviewSession"
            @change="
              reviewIndex = 0;
              revealed = false;
            "
          >
            <option v-for="(s, id) in reviewSessions" :key="id" :value="id">
              {{ s.label }}
            </option>
          </select></label
        >
      </div>
      <template v-if="reviewQuestion"
        ><p>{{ (reviewIndex % reviews.length) + 1 }} из {{ reviews.length }}</p>
        <div class="platform-actions question-navigation">
          <button
            data-action="previous-question"
            :disabled="reviewIndex === 0"
            @click="reviewPrevious"
          >
            ← Предыдущий вопрос
          </button>
          <button
            :disabled="revealed"
            data-action="reveal"
            @click="revealed = true"
          >
            Показать ответ</button
          ><button data-action="next-question" @click="reviewNext">
            Следующий вопрос →
          </button>
        </div>
        <QuestionCard :question="reviewQuestion" :revealed="revealed">
          <template v-if="revealed"
            ><RatingButtons :id="reviewQuestion.id" /><StudyLinks
              :question="reviewQuestion"
          /></template>
        </QuestionCard>
      </template>
      <p v-else>Здесь пока нет вопросов. Выберите другой набор.</p>
    </template>
  </template>
</template>
