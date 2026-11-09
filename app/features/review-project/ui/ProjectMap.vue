<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Project, Topic } from "#domain/projects/types.ts";
import {
  projectMapDiagram,
  type ProjectMapView,
  type ProjectMapNode,
} from "#domain/projects/map.ts";
import {
  mapOverviewNodes,
  scenarioDiagram,
  structureDiagram,
} from "#domain/projects/map-presentation.ts";
import ProjectMapInspector from "./ProjectMapInspector.vue";
import ProjectMapCanvas from "./ProjectMapCanvas.vue";
const props = defineProps<{
  project: Project;
  topics: Topic[];
  topicLink: (id: string) => { path: string; query: Record<string, string> };
}>();
const route = useRoute(),
  router = useRouter(),
  host = ref<HTMLElement>(),
  expanded = ref(false),
  search = ref("");
const views = [
  { id: "scenarios", title: "Сценарии" },
  { id: "structure", title: "Устройство" },
  { id: "technologies", title: "Технологии" },
] as const;
const view = computed<ProjectMapView>(
  () =>
    views.find((item) => item.id === route.query.mapView)?.id || "scenarios",
);
const diagram = computed(() =>
  projectMapDiagram(props.project, props.topics, view.value),
);
const scenario = computed(() =>
  view.value === "scenarios"
    ? diagram.value.nodes.find(
        (node) => node.id === route.query.mapScenario && node.steps?.length,
      )
    : undefined,
);
const graph = computed(() =>
  scenario.value
    ? scenarioDiagram(scenario.value)
    : structureDiagram(diagram.value, props.project.name),
);
const isGraph = computed(
  () => view.value === "structure" || Boolean(scenario.value),
);
const selected = computed(() =>
  [...diagram.value.nodes, ...(scenario.value ? graph.value.nodes : [])].find(
    (node) => node.id === route.query.mapNode,
  ),
);
const details = computed(
  () => selected.value || scenario.value || diagram.value.nodes[0],
);
const cards = computed(() =>
  mapOverviewNodes(diagram.value, view.value).filter((node) =>
    (node.label + " " + node.description)
      .toLocaleLowerCase("ru")
      .includes(search.value.trim().toLocaleLowerCase("ru")),
  ),
);
const groups = computed(() => {
  const result = new Map<string, ProjectMapNode[]>();
  for (const node of cards.value) {
    const group =
      view.value === "technologies" || props.project.map
        ? ""
        : props.topics.find((topic) => topic.id === node.topicIds[0])?.group ||
          "";
    result.set(group, [...(result.get(group) || []), node]);
  }
  return [...result].map(([title, nodes]) => ({ title, nodes }));
});
const modules = computed(
  () =>
    structureDiagram(
      projectMapDiagram(props.project, props.topics, "structure"),
      props.project.name,
    ).nodes,
);
function technologyModules(node: ProjectMapNode) {
  return modules.value.filter((module) =>
    module.topicIds.some((id) => node.topicIds.includes(id)),
  );
}
function summary(text: string) {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 180) return plain;
  const end = plain.lastIndexOf(" ", 180);
  return plain.slice(0, end > 100 ? end : 180) + "…";
}
function update(values: Record<string, string | undefined>) {
  return router.push({
    path: "/projects",
    query: {
      ...route.query,
      mode: "overview",
      project: props.project.id,
      ...values,
    },
  });
}
function chooseView(id: ProjectMapView) {
  search.value = "";
  update({ mapView: id, mapNode: undefined, mapScenario: undefined });
}
function chooseNode(node: ProjectMapNode) {
  if (node.kind === "module" && view.value !== "structure") {
    const module = modules.value.find(
      (item) =>
        item.id === node.id ||
        item.id === node.id.replace(/^group:/, "module:"),
    );
    if (module) {
      search.value = "";
      update({
        mapView: "structure",
        mapNode: module.id,
        mapScenario: undefined,
      });
      return;
    }
  }
  update({ mapNode: node.id });
}
function openScenario(node: ProjectMapNode) {
  update({ mapScenario: node.id, mapNode: undefined });
}
async function clear() {
  const id = selected.value?.id;
  await update({ mapNode: undefined });
  await nextTick();
  if (id)
    host.value
      ?.querySelector<HTMLElement>(`[data-map-node="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true });
}
async function fullscreen() {
  if (expanded.value) {
    if (document.fullscreenElement === host.value)
      await document.exitFullscreen();
    expanded.value = false;
  } else {
    try {
      await host.value?.requestFullscreen();
    } catch {
      expanded.value = true;
    }
  }
}
function fullscreenChanged() {
  expanded.value = document.fullscreenElement === host.value;
}
function escape(event: KeyboardEvent) {
  if (event.key === "Escape" && expanded.value && !document.fullscreenElement)
    expanded.value = false;
}
watch(
  () => [props.project.id, view.value],
  () => {
    search.value = "";
  },
);
onMounted(() => {
  document.addEventListener("fullscreenchange", fullscreenChanged);
  window.addEventListener("keydown", escape);
});
onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", fullscreenChanged);
  window.removeEventListener("keydown", escape);
});
</script>
<template>
  <section
    ref="host"
    class="project-map"
    :class="{ 'is-fullscreen': expanded }"
    aria-label="Визуальная карта проекта"
  >
    <header class="project-map-heading">
      <div>
        <h2>{{ project.name }}</h2>
      </div>
      <nav class="project-map-views" aria-label="Представление карты">
        <button
          v-for="item in views"
          :key="item.id"
          :aria-pressed="view === item.id"
          @click="chooseView(item.id)"
        >
          {{ item.title }}
        </button>
      </nav>
    </header>
    <div class="map-toolbar">
      <nav v-if="scenario" class="map-breadcrumbs" aria-label="Путь сценария">
        <button
          @click="update({ mapScenario: undefined, mapNode: scenario.id })"
        >
          ← Все сценарии</button
        ><span>{{ scenario.label }}</span>
      </nav>
      <label v-else-if="!isGraph" class="map-search"
        ><input
          v-model="search"
          :aria-label="
            view === 'technologies' ? 'Поиск технологий' : 'Поиск сценариев'
          "
          :placeholder="
            view === 'technologies' ? 'Найти технологию…' : 'Найти сценарий…'
          "
      /></label>
      <div v-else />
      <div class="map-toolbar-actions">
        <button
          :style="{ visibility: selected ? 'visible' : 'hidden' }"
          :disabled="!selected"
          data-action="clear-map-selection"
          @click="clear"
        >
          Снять выбор</button
        ><button
          :aria-pressed="expanded"
          data-action="expand-map"
          @click="fullscreen"
        >
          {{ expanded ? "Свернуть карту" : "Развернуть карту" }}
        </button>
      </div>
    </div>
    <div class="project-map-workspace">
      <div class="map-main">
        <KeepAlive
          ><ProjectMapCanvas
            v-if="isGraph"
            :diagram="graph"
            :direction="view === 'structure' ? 'DOWN' : 'RIGHT'"
            :selected="selected?.id"
            :scope="
              project.id + ':' + view + ':' + (scenario?.id || 'overview')
            "
            @choose="chooseNode"
            @clear="clear"
        /></KeepAlive>
        <div v-if="!isGraph" class="map-overview" :class="'overview-' + view">
          <section
            v-for="group in groups"
            :key="group.title"
            class="map-card-group"
          >
            <h3 v-if="groups.length > 1 && group.title">{{ group.title }}</h3>
            <div class="map-card-grid">
              <article
                v-for="node in group.nodes"
                :key="node.id"
                class="map-overview-card"
                :class="{ 'is-selected': selected?.id === node.id }"
              >
                <button
                  class="map-card-select"
                  :data-map-node="node.id"
                  :data-topic-id="
                    node.topicIds.length === 1 ? node.topicIds[0] : undefined
                  "
                  :aria-pressed="selected?.id === node.id"
                  @click="chooseNode(node)"
                >
                  <strong>{{ node.label }}</strong>
                  <p v-if="node.description">{{ summary(node.description) }}</p>
                </button>
                <div
                  v-if="
                    view === 'technologies' && technologyModules(node).length
                  "
                  class="map-technology-modules"
                >
                  <span>Связанные разделы</span
                  ><button
                    v-for="module in technologyModules(node).slice(0, 3)"
                    :key="module.id"
                    @click="
                      update({
                        mapView: 'structure',
                        mapNode: module.id,
                        mapScenario: undefined,
                      })
                    "
                  >
                    {{ module.label }} →
                  </button>
                </div>
                <button
                  v-if="node.steps?.length"
                  class="map-card-open"
                  @click="openScenario(node)"
                >
                  Показать сценарий →
                </button>
                <span v-else-if="node.topicIds.length" class="map-card-count"
                  >{{ node.topicIds.length }}
                  {{ node.topicIds.length === 1 ? "тема" : "темы" }}</span
                >
              </article>
            </div>
          </section>
          <p v-if="!cards.length" class="platform-muted">Ничего не найдено.</p>
        </div>
      </div>
      <ProjectMapInspector
        v-if="details"
        :node="details"
        :diagram="scenario && selected ? graph : diagram"
        :project="project"
        :topics="topics"
        :view="view"
        :selected="Boolean(selected)"
        :scenario-opened="Boolean(scenario)"
        :related-modules="
          details.kind === 'technology' ? technologyModules(details) : []
        "
        :topic-link="topicLink"
        @choose="chooseNode"
        @close="clear"
        @scenario="openScenario"
      />
    </div>
  </section>
</template>
<style scoped>
.project-map {
  min-width: 0;
  margin-top: 24px;
  background: white;
}
.project-map-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 24px;
  flex-wrap: wrap;
}
.project-map-heading h2 {
  margin: 0 0 8px;
}
.project-map-heading p {
  max-width: 65ch;
  margin: 0;
  color: var(--muted);
}
.project-map-views {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.project-map-views button[aria-pressed="true"] {
  background: #e8efff;
  border-color: var(--accent);
  color: var(--accent);
}
.map-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 20px 0 12px;
  min-height: 44px;
}
.map-toolbar-actions {
  display: flex;
  gap: 8px;
}
.map-toolbar button {
  font-size: 13px;
  padding: 8px 12px;
}
.map-search input {
  width: min(100%, 300px);
  font-size: 14px;
}
.map-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}
.map-breadcrumbs button {
  white-space: nowrap;
}
.project-map-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 370px;
  gap: 20px;
  align-items: start;
}
.map-main {
  min-width: 0;
  min-height: 620px;
}
.map-overview {
  height: 620px;
  overflow: auto;
  padding-right: 4px;
  overflow-anchor: none;
}
.map-card-group h3 {
  font-size: 15px;
  margin: 0 0 12px;
}
.map-card-group + section {
  margin-top: 20px;
}
.map-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.map-overview-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: white;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.map-overview-card.is-selected {
  border-color: var(--accent);
  background: #f3f6ff;
  box-shadow: 0 0 0 1px var(--accent);
}
.platform .map-card-select {
  display: block;
  min-height: 116px;
  border: 0;
  border-radius: 0;
  text-align: left;
  padding: 18px;
  background: transparent;
  width: 100%;
  font-weight: 400;
  flex: 1;
}
.map-card-select strong {
  display: block;
  font-size: 15px;
  line-height: 1.5;
}
.map-card-select :deep(p) {
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
  margin: 10px 0 0;
}
.map-card-select :deep(a) {
  pointer-events: none;
}
.platform .map-card-open {
  border: 0;
  border-top: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  padding: 12px 18px;
  text-align: left;
  justify-content: flex-start;
  font-size: 13px;
  color: var(--accent);
}
.map-card-count {
  font-size: 12px;
  color: var(--muted);
  padding: 0 18px 14px;
}
.map-technology-modules {
  padding: 0 18px 16px;
}
.map-technology-modules > span {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 6px;
}
.platform .map-technology-modules button {
  border: 0;
  background: transparent;
  min-height: 28px;
  padding: 4px 0;
  font-size: 12px;
  font-weight: 400;
  text-align: left;
  color: var(--accent);
  display: block;
}
.project-map:fullscreen,
.project-map.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 50;
  margin: 0;
  padding: 24px;
  overflow: auto;
  background: white;
}
.project-map:fullscreen .map-overview,
.project-map.is-fullscreen .map-overview {
  height: calc(100dvh - 210px);
}
.project-map:fullscreen :deep(.map-inspector),
.project-map.is-fullscreen :deep(.map-inspector) {
  height: calc(100dvh - 210px);
}
.project-map:fullscreen :deep(.project-map-viewport),
.project-map.is-fullscreen :deep(.project-map-viewport) {
  height: calc(100dvh - 266px);
}
@media (max-width: 1250px) {
  .project-map-workspace {
    grid-template-columns: minmax(0, 1fr) 340px;
  }
  .map-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 1000px) {
  .project-map-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .map-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .map-overview {
    height: auto;
    overflow: visible;
    padding: 0;
  }
  .map-toolbar {
    align-items: start;
  }
  .project-map-heading p {
    max-width: 100%;
  }
}
@media (max-width: 600px) {
  .project-map-views {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .project-map-views button {
    padding-inline: 8px;
    font-size: 12px;
  }
  .map-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .map-toolbar {
    flex-wrap: wrap;
  }
  .map-toolbar-actions {
    margin-left: auto;
  }
  .map-breadcrumbs {
    flex-wrap: wrap;
  }
  .project-map:fullscreen,
  .project-map.is-fullscreen {
    padding: 12px;
  }
}
</style>
