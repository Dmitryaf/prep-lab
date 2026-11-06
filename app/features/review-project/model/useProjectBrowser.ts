import { storeToRefs } from "pinia";
import { computed, ref, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useProjectCatalog } from "#ui/entities/project/model/catalog.ts";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
import { link } from "#ui/shared/lib/navigation.ts";
import {
  selectQuestionReview,
  sessions as reviewSessions,
} from "#domain/projects/review.ts";
export function useProjectBrowser() {
  const { catalog, projects, topics, projectCards } =
    storeToRefs(useProjectCatalog());
  const { progress } = storeToRefs(usePreparation());

  const route = useRoute(),
    router = useRouter(),
    project = ref(
      catalog.value.defaultProject || Object.keys(projects.value)[0] || "",
    ),
    mode = ref("overview"),
    group = ref("Все"),
    query = ref(""),
    routeId = ref(
      catalog.value.defaultRoute ||
        projects.value[project.value]?.routes[0]?.id ||
        "",
    );
  const reviewScope = ref("current"),
    reviewFilter = ref("priority"),
    reviewMode = ref("full"),
    reviewSession = ref("custom"),
    reviewIndex = ref(0),
    revealed = ref(false);
  const selected = computed(() =>
    topics.value.find((t) => t.id === route.query.projectTopic),
  );
  watch(
    () => selected.value,
    async (t, previous) => {
      if (t) {
        project.value = t.project;
        if (
          !projects.value[t.project].routes.some((r) => r.id === routeId.value)
        )
          routeId.value = projects.value[t.project].routes[0]?.id || "";
        await nextTick();
        document
          .querySelector<HTMLElement>("#details .topic-title")
          ?.focus({ preventScroll: true });
      } else if (previous) {
        await nextTick();
        document
          .querySelector<HTMLElement>(`[data-topic-id="${previous.id}"]`)
          ?.focus({ preventScroll: true });
      }
    },
    { immediate: true },
  );
  watch(
    () => route.query,
    (params) => {
      if (
        typeof params.project === "string" &&
        projects.value[params.project] &&
        (!selected.value || selected.value.project === params.project)
      )
        project.value = params.project;
      if (["overview", "topics", "map", "review"].includes(String(params.mode)))
        mode.value = String(params.mode);
      if (typeof params.group === "string") group.value = params.group;
      if (typeof params.search === "string") query.value = params.search;
      if (
        typeof params.route === "string" &&
        projects.value[project.value]?.routes.some((r) => r.id === params.route)
      )
        routeId.value = params.route;
    },
    { immediate: true },
  );
  const projectTopics = computed(() =>
    topics.value.filter((t) => t.project === project.value),
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
    projects.value[project.value]?.routes.find((r) => r.id === routeId.value),
  );
  const routeTopics = computed(
    () =>
      currentRoute.value?.nodes
        .map((id) => topics.value.find((t) => t.id === id)!)
        .filter(Boolean) || [],
  );
  const contextQuery = () => ({
    project: project.value,
    mode: mode.value,
    group: group.value,
    search: query.value,
    route: routeId.value,
    ...(typeof route.query.mapView === "string"
      ? { mapView: route.query.mapView }
      : {}),
    ...(typeof route.query.mapNode === "string"
      ? { mapNode: route.query.mapNode }
      : {}),
  });
  const topicLink = (id: string) =>
    link("projects", { ...contextQuery(), projectTopic: id });
  const readingTopics = computed(() =>
    mode.value === "map" &&
    routeTopics.value.some((t) => t.id === selected.value?.id)
      ? routeTopics.value
      : filtered.value.some((t) => t.id === selected.value?.id)
        ? filtered.value
        : projectTopics.value,
  );
  const position = computed(() =>
    readingTopics.value.findIndex((t) => t.id === selected.value?.id),
  );
  async function closeTopic() {
    const id = selected.value?.id;
    await router.push(link("projects", contextQuery()));
    await nextTick();
    document.querySelector<HTMLElement>(`[data-topic-id="${id}"]`)?.focus();
  }
  const reviews = computed(() =>
    selectQuestionReview(topics.value, progress.value.questionProgress, {
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
    return projectCards.value.find((p) => p.id === q?.id);
  });
  function selectProject(id: string) {
    project.value = id;
    group.value = "Все";
    query.value = "";
    routeId.value = projects.value[id].routes[0]?.id || "";
    reviewIndex.value = 0;
    revealed.value = false;
    void router.replace("/projects");
  }
  function reviewNext() {
    reviewIndex.value++;
    revealed.value = false;
  }

  return {
    projects,
    topics,
    projectCards,
    progress,
    link,
    reviewSessions,
    route,
    router,
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
  };
}
