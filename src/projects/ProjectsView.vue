<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { projects, topics, projectCards } from "./catalog";
import { progress, rate } from "../app/store";
import { link } from "../app/router";
import { selectQuestionReview, sessions as reviewSessions } from "./review.js";
import PageHeading from "../shared/PageHeading.vue";
import TopicDetail from "./TopicDetail.vue";
import QuestionCard from "../shared/QuestionCard.vue";
import RatingButtons from "../shared/RatingButtons.vue";
import StudyLinks from "../shared/StudyLinks.vue";
const route = useRoute(),
  router = useRouter(),
  project = ref("trajectory"),
  mode = ref("topics"),
  group = ref("Все"),
  query = ref(""),
  routeId = ref("tr-r2");
const reviewScope = ref("current"),
  reviewFilter = ref("priority"),
  reviewMode = ref("full"),
  reviewSession = ref("custom"),
  reviewIndex = ref(0),
  revealed = ref(false);
const selected = computed(() =>
  topics.find((t) => t.id === route.query.projectTopic),
);
watch(
  () => selected.value,
  async (t,previous) => {
    if (t) {
      project.value = t.project;
      if (!projects[t.project].routes.some((r) => r.id === routeId.value))
        routeId.value = projects[t.project].routes[0].id;
      await nextTick();
      document.querySelector<HTMLElement>('#details .topic-title')?.focus({preventScroll:true});
    }else if(previous){
      await nextTick();document.querySelector<HTMLElement>(`[data-topic-id="${previous.id}"]`)?.focus({preventScroll:true});
    }
  },
  { immediate: true },
);
watch(()=>route.query,params=>{
  if(typeof params.project==='string'&&projects[params.project]&&(!selected.value||selected.value.project===params.project))project.value=params.project;
  if(['topics','map','review'].includes(String(params.mode)))mode.value=String(params.mode);
  if(typeof params.group==='string')group.value=params.group;
  if(typeof params.search==='string')query.value=params.search;
  if(typeof params.route==='string'&&projects[project.value].routes.some(r=>r.id===params.route))routeId.value=params.route;
},{immediate:true});
const projectTopics = computed(() =>
  topics.filter((t) => t.project === project.value),
);
const groups = computed(() => [
  "Все",
  ...new Set(projectTopics.value.map((t) => t.group)),
]);
const filtered = computed(() =>
  projectTopics.value.filter(
    (t) =>
      (group.value === "Все" || t.group === group.value) &&
      [t.title, t.summary]
        .join(" ")
        .toLocaleLowerCase("ru")
        .includes(query.value.toLocaleLowerCase("ru")),
  ),
);
const currentRoute = computed(() =>
  projects[project.value].routes.find((r) => r.id === routeId.value),
);
const routeTopics = computed(
  () =>
    currentRoute.value?.nodes
      .map((id) => topics.find((t) => t.id === id)!)
      .filter(Boolean) || [],
);
const contextQuery=()=>({project:project.value,mode:mode.value,group:group.value,search:query.value,route:routeId.value});
const topicLink=(id:string)=>link('projects',{...contextQuery(),projectTopic:id});
const readingTopics=computed(()=>mode.value==='map'&&routeTopics.value.some(t=>t.id===selected.value?.id)?routeTopics.value:filtered.value.some(t=>t.id===selected.value?.id)?filtered.value:projectTopics.value);
const position=computed(()=>readingTopics.value.findIndex(t=>t.id===selected.value?.id));
async function closeTopic(){
  const id=selected.value?.id;
  await router.push(link('projects',contextQuery()));await nextTick();
  document.querySelector<HTMLElement>(`[data-topic-id="${id}"]`)?.focus();
}
const reviews = computed(() =>
  selectQuestionReview(topics, progress.value.questionProgress, {
    project: project.value,
    scope: reviewScope.value,
    filter: reviewFilter.value,
    mode: reviewMode.value,
    session: reviewSession.value,
  }),
);
const reviewQuestion = computed(() => {
  const q =
    reviews.value[reviewIndex.value % Math.max(1, reviews.value.length)];
  return projectCards.find((p) => p.id === q?.id);
});
function selectProject(id: string) {
  project.value = id;
  group.value = "Все";
  query.value = "";
  routeId.value = projects[id].routes[0].id;
  reviewIndex.value = 0;
  revealed.value = false;
  void router.replace("/projects");
}
function reviewNext() {
  reviewIndex.value++;
  revealed.value = false;
}
</script>
<template>
  <template v-if="selected">
    <div class="reading-toolbar">
      <button class="platform-back" data-action="back-to-topics" @click="closeTopic">← {{mode==='map'?'К маршруту':'К списку тем'}}</button>
      <span class="reading-location">{{projects[selected.project].name}} <span aria-hidden="true">/</span> {{selected.group}}</span>
      <span class="reading-position">Тема {{position+1}} из {{readingTopics.length}}</span>
    </div>
    <nav class="reading-neighbours" aria-label="Соседние темы">
      <RouterLink v-if="position>0" :to="topicLink(readingTopics[position-1]!.id)">← <span class="neighbour-title">{{readingTopics[position-1]!.title}}</span><span class="neighbour-label">Предыдущая тема</span></RouterLink><span v-else />
      <RouterLink v-if="position>=0&&position<readingTopics.length-1" :to="topicLink(readingTopics[position+1]!.id)"><span class="neighbour-title">{{readingTopics[position+1]!.title}}</span><span class="neighbour-label">Следующая тема</span> →</RouterLink>
    </nav>
    <TopicDetail :key="selected.id" :topic="selected" :route-nodes="mode==='map'?currentRoute?.nodes:undefined" />
  </template>
  <template v-else-if="route.query.projectTopic">
    <PageHeading title="Тема не найдена" description="Возможно, ссылка устарела. Выберите тему из списка проекта." />
    <RouterLink :to="link('projects',contextQuery())">К списку тем →</RouterLink>
  </template>
  <template v-else>
  <div class="catalog-heading">
  <PageHeading
    title="Проекты"
    description="Карта проектов, маршруты, объяснения и ссылки на реализацию."
  />
  <div class="platform-actions">
    <RouterLink
      class="platform-button secondary"
      data-action="project-practice"
      :to="link('practice', { category: 'projects' })"
      >Проекты и рабочий опыт · {{ projectCards.length }} вопросов</RouterLink
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
  <template v-if="mode === 'topics'"
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
        projectTopics.filter((t) => progress.progress[t.id]?.status === "done")
          .length
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
          aria-label="Охват"
          v-model="reviewScope"
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
          aria-label="Набор"
          v-model="reviewFilter"
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
      <QuestionCard
        :key="reviewQuestion.id"
        :question="reviewQuestion"
        :revealed="revealed" />
      <div class="platform-actions">
        <button v-if="!revealed" data-action="reveal" @click="revealed = true">
          Показать ответ</button
        ><button data-action="next-question" @click="reviewNext">
          Следующий вопрос →
        </button>
      </div>
      <template v-if="revealed"
        ><RatingButtons :id="reviewQuestion.id" /><StudyLinks
          :question="reviewQuestion" /></template
    ></template>
    <p v-else>Здесь пока нет вопросов. Выберите другой набор.</p>
  </template>
  </template>
</template>
