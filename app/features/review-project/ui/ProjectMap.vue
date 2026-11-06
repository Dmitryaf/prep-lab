<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { CodeStep, Project, Topic } from "#domain/projects/types.ts";
import {
  projectMapDiagram,
  layoutProjectMap,
  type ProjectMapView,
  type ProjectMapNode,
} from "#domain/projects/map.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
import { useProjectCatalog } from "#ui/entities/project/model/catalog.ts";
import { sourceUrl, localCodeReference } from "#domain/projects/sources.ts";
const props = defineProps<{
  project: Project;
  topics: Topic[];
  topicLink: (id: string) => { path: string; query: Record<string, string> };
}>();
const route = useRoute(),
  router = useRouter(),
  catalog = useProjectCatalog();
const viewport = ref<HTMLElement>(),
  zoom = ref(1),
  copied = ref("");
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
const selected = computed(() =>
  diagram.value.nodes.find((node) => node.id === route.query.mapNode),
);
const focusedDiagram = computed(() => {
  if (props.project.map || view.value !== "scenarios") return diagram.value;
  const { nodes, edges } = diagram.value;
  const root = nodes[0];
  const branches = edges
    .filter((edge) => edge.from === root.id)
    .map((edge) => edge.to);
  const branch =
    selected.value &&
    (branches.includes(selected.value.id)
      ? selected.value.id
      : edges.find((edge) => edge.to === selected.value!.id)?.from);
  const visible = new Set([
    root.id,
    ...branches,
    ...edges.filter((edge) => edge.from === branch).map((edge) => edge.to),
  ]);
  return {
    nodes: nodes.filter((node) => visible.has(node.id)),
    edges: edges.filter(
      (edge) => visible.has(edge.from) && visible.has(edge.to),
    ),
  };
});
const layout = computed(() =>
  layoutProjectMap(focusedDiagram.value, view.value === "structure"),
);
const selectedTopics = computed(() =>
  props.topics.filter((topic) => selected.value?.topicIds.includes(topic.id)),
);
const related = computed(() =>
  diagram.value.edges.filter(
    (edge) =>
      (edge.from === selected.value?.id || edge.to === selected.value?.id) &&
      (view.value !== "structure" || edge.kind !== "contains"),
  ),
);
const details = computed(() => selected.value || diagram.value.nodes[0]);
const topic = computed(() =>
  selectedTopics.value.length === 1 ? selectedTopics.value[0] : undefined,
);
const steps = computed(() =>
  topic.value?.pilot.explanation.steps.length
    ? topic.value.pilot.explanation.steps
    : topic.value?.mechanism.map((text, index) => ({
        title: `Шаг ${index + 1}`,
        text,
      })) || [],
);
function updateQuery(values: { mapView?: string; mapNode?: string }) {
  void router.replace({
    path: "/projects",
    query: {
      ...route.query,
      mode: "overview",
      project: props.project.id,
      ...values,
    },
  });
}
function chooseView(value: ProjectMapView) {
  zoom.value = 1;
  updateQuery({ mapView: value, mapNode: undefined });
}
function chooseNode(node: ProjectMapNode) {
  copied.value = "";
  updateQuery({ mapNode: node.id });
}
async function copyReference(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = "Путь скопирован";
  } catch {
    copied.value = "Не удалось скопировать путь";
  }
}
function referenceUrl(reference: CodeStep) {
  const owner = props.topics.find((topic) =>
    topic.pilot.code.steps.some(
      (step) =>
        step.project === reference.project &&
        step.path === reference.path &&
        step.line === reference.line,
    ),
  );
  return sourceUrl(
    reference,
    catalog.catalog.repositories,
    owner?.pilot.sourceRevision ||
      catalog.projects[reference.project]?.branch ||
      "main",
  );
}
watch(
  () => [props.project.id, view.value],
  async () => {
    await nextTick();
    viewport.value?.scrollTo({ top: 0, left: 0 });
  },
);
</script>
<template>
  <section class="project-map" aria-label="Визуальная карта проекта">
    <div class="project-map-heading">
      <div>
        <h2>{{ project.name }}</h2>
        <p>{{ project.pitch || project.subtitle }}</p>
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
    </div>
    <div class="project-map-controls">
      <button
        :disabled="zoom <= 0.6"
        aria-label="Уменьшить карту"
        @click="zoom = Math.max(0.6, zoom - 0.2)"
      >
        −
      </button>
      <button aria-label="Сбросить масштаб карты" @click="zoom = 1">
        {{ Math.round(zoom * 100) }}%
      </button>
      <button
        :disabled="zoom >= 1.6"
        aria-label="Увеличить карту"
        @click="zoom = Math.min(1.6, zoom + 0.2)"
      >
        +
      </button>
      <button
        :disabled="!selected"
        @click="updateQuery({ mapNode: undefined })"
      >
        Вся карта
      </button>
    </div>
    <div class="project-map-workspace">
      <div
        ref="viewport"
        class="project-map-viewport"
        tabindex="0"
        aria-label="Схема проекта"
      >
        <div
          class="project-map-size"
          :style="{
            width: layout.width * zoom + 'px',
            height: layout.height * zoom + 'px',
          }"
        >
          <div
            class="project-map-canvas"
            :style="{
              width: layout.width + 'px',
              height: layout.height + 'px',
              transform: `scale(${zoom})`,
            }"
          >
            <svg
              :width="layout.width"
              :height="layout.height"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="project-map-arrow"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <path d="M0,0 L7,3.5 L0,7" fill="#8ba0bc" />
                </marker>
              </defs>
              <path
                v-for="(edge, index) in layout.edges.filter(
                  (edge) =>
                    view !== 'structure' ||
                    (selected &&
                      edge.kind !== 'contains' &&
                      (edge.from === selected.id || edge.to === selected.id)),
                )"
                :key="index"
                :d="edge.path"
                class="project-map-edge"
                :class="{
                  'is-focused':
                    selected &&
                    (edge.from === selected.id || edge.to === selected.id),
                }"
                marker-end="url(#project-map-arrow)"
              >
                <title>{{ edge.label }}</title>
              </path>
            </svg>
            <button
              v-for="node in layout.nodes"
              :key="node.id"
              class="project-map-node"
              :class="'node-' + node.kind"
              :style="{ left: node.x + 'px', top: node.y + 'px' }"
              :aria-pressed="selected?.id === node.id"
              :data-map-node="node.id"
              :data-topic-id="
                node.topicIds.length === 1 ? node.topicIds[0] : undefined
              "
              @click="chooseNode(node)"
            >
              <span class="project-map-node-kind">{{
                node.id.startsWith("group:")
                  ? "Раздел"
                  : node.id.startsWith("topic:")
                    ? "Разбор"
                    : node.kind === "scenario"
                      ? "Сценарий"
                      : node.kind === "technology"
                        ? "Технология"
                        : node.kind === "module"
                          ? "Модуль"
                          : "Система"
              }}</span>
              <strong>{{ node.label }}</strong>
            </button>
          </div>
        </div>
      </div>
      <aside class="project-map-detail" aria-label="Выбранный элемент карты">
        <h3>{{ details.label }}</h3>
        <MarkdownContent
          v-if="details.description"
          :text="details.description"
        />
        <ul v-if="related.length" class="project-map-relations">
          <li v-for="(edge, index) in related" :key="index">
            <button
              @click="
                chooseNode(diagram.nodes.find((node) => node.id === edge.from)!)
              "
            >
              {{ diagram.nodes.find((node) => node.id === edge.from)?.label }}
            </button>
            <span>{{ edge.label }} →</span>
            <button
              @click="
                chooseNode(diagram.nodes.find((node) => node.id === edge.to)!)
              "
            >
              {{ diagram.nodes.find((node) => node.id === edge.to)?.label }}
            </button>
          </li>
        </ul>
        <div v-if="selectedTopics.length" class="project-map-topic-links">
          <RouterLink
            v-for="item in selectedTopics"
            :key="item.id"
            :to="topicLink(item.id)"
            >{{
              selectedTopics.length === 1 ? "Открыть разбор" : item.title
            }}
            →</RouterLink
          >
        </div>
        <ol
          v-if="steps.length && view !== 'structure'"
          class="project-map-flow"
          aria-label="Шаги сценария"
        >
          <li v-for="(step, index) in steps" :key="index">
            <span>{{ index + 1 }}</span>
            <div>
              <h4>{{ step.title }}</h4>
              <MarkdownContent :text="step.text" />
            </div>
          </li>
        </ol>
        <details
          v-if="details.codeReferences?.length"
          :key="details.id"
          class="project-map-code"
        >
          <summary>Код · {{ details.codeReferences.length }}</summary>
          <div
            v-for="reference in details.codeReferences"
            :key="reference.path + ':' + reference.line"
          >
            <a
              v-if="referenceUrl(reference)"
              :href="referenceUrl(reference)!"
              target="_blank"
              rel="noopener noreferrer"
              >{{ reference.path }}:{{ reference.line }} ↗</a
            >
            <button
              v-else
              @click="copyReference(localCodeReference(reference))"
            >
              {{ reference.path }}:{{ reference.line }}
            </button>
            <MarkdownContent :text="reference.explanation" />
          </div>
          <p v-if="copied" role="status">{{ copied }}</p>
        </details>
      </aside>
    </div>
    <p v-if="diagram.nodes.length === 1" class="platform-muted">
      {{
        view === "technologies"
          ? "Технологии пока не добавлены."
          : view === "structure"
            ? "Устройство проекта пока не описано."
            : "Сценарии пока не добавлены."
      }}
    </p>
  </section>
</template>
<style scoped>
.project-map {
  min-width: 0;
  margin-top: 24px;
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
.project-map-views,
.project-map-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.project-map-views button[aria-pressed="true"] {
  background: #e8efff;
  border-color: var(--accent);
  color: var(--accent);
}
.project-map-controls {
  margin: 20px 0 12px;
}
.project-map-controls button {
  min-width: 40px;
  padding: 7px 12px;
}
.project-map-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}
.project-map-viewport {
  min-width: 0;
  overflow: auto;
  height: 560px;
  overflow-anchor: none;
  border: 1px solid var(--line);
  border-radius: 12px;
  background:
    radial-gradient(#dbe4f2 1px, transparent 1px) 0 0 / 16px 16px,
    #f8faff;
}
.project-map-size {
  position: relative;
}
.project-map-canvas {
  position: absolute;
  inset: 0 auto auto 0;
  transform-origin: top left;
}
.project-map-canvas svg {
  position: absolute;
  pointer-events: none;
}
.project-map-edge {
  fill: none;
  stroke: #9aadc5;
  stroke-width: 1.5;
}
.project-map-edge.is-focused {
  stroke: var(--accent);
  stroke-width: 2.5;
}
.platform .project-map-node {
  position: absolute;
  width: 220px;
  height: 84px;
  padding: 12px 16px;
  text-align: left;
  background: white;
  box-shadow: 0 2px 5px #23395b0a;
  border-radius: 10px;
  border: 1px solid #c9d6e8;
  display: block;
}
.project-map-node strong {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.project-map-node-kind {
  display: block;
  color: var(--muted);
  font-size: 10px;
  margin-bottom: 5px;
}
.platform .project-map-node.node-technology {
  border-left: 4px solid #9a72ca;
}
.platform .project-map-node.node-scenario {
  border-left: 4px solid #5284d6;
}
.platform .project-map-node.node-module {
  border-left: 4px solid #3e9b85;
}
.platform .project-map-node.node-system {
  border-left: 4px solid #d49c44;
}
.platform .project-map-node[aria-pressed="true"] {
  border-color: var(--accent);
  background: #edf3ff;
}
.project-map-detail {
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  min-width: 0;
  height: 560px;
  overflow-anchor: none;
  overflow: auto;
}
.project-map-detail h3 {
  margin-top: 0;
  overflow-wrap: anywhere;
}
.project-map-detail :deep(p) {
  font-size: 14px;
  line-height: 1.6;
}
.project-map-topic-links {
  display: grid;
  gap: 12px;
  margin-block: 20px;
}
.project-map-flow {
  padding: 0;
  list-style: none;
  margin-block: 24px;
}
.project-map-flow li {
  display: flex;
  gap: 12px;
  position: relative;
  padding-bottom: 20px;
}
.project-map-flow li:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 26px;
  left: 12px;
  bottom: 0;
  border-left: 1px solid #aebfda;
}
.project-map-flow li > span {
  flex: 0 0 25px;
  height: 25px;
  border-radius: 50%;
  background: #dce8fa;
  text-align: center;
  font-size: 12px;
  line-height: 25px;
}
.project-map-flow h4 {
  margin: 2px 0 8px;
}
.project-map-flow :deep(p) {
  margin-block: 4px;
}
.project-map-relations {
  list-style: none;
  padding: 0;
  margin-block: 24px 0;
}
.project-map-relations li {
  border-top: 1px solid var(--line);
  padding-block: 12px;
}
.project-map-relations span {
  display: block;
  font-size: 11px;
  color: var(--muted);
}
.project-map-relations button {
  text-align: left;
  padding: 5px 0;
  background: transparent;
  border: 0;
  color: var(--accent);
}
.project-map-code a,
.project-map-code button {
  overflow-wrap: anywhere;
  text-align: left;
  font-size: 12px;
}
@media (max-width: 1100px) {
  .project-map-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 600px) {
  .project-map-views {
    width: 100%;
  }
  .project-map-views button {
    flex: 1;
    padding-inline: 8px;
    font-size: 12px;
  }
  .project-map-viewport {
    height: 400px;
  }
  .project-map-detail {
    height: 440px;
  }
}
</style>
