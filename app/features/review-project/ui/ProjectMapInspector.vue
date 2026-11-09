<script setup lang="ts">
import { computed, ref, watch, useId, nextTick } from "vue";
import type { CodeStep, Project, Topic } from "#domain/projects/types.ts";
import type {
  MapDiagram,
  ProjectMapNode,
  ProjectMapView,
} from "#domain/projects/map.ts";
import {
  mapRelations,
  mapMaterials,
} from "#domain/projects/map-presentation.ts";
import { sourceUrl, localCodeReference } from "#domain/projects/sources.ts";
import { codePresentation } from "#domain/projects/code.ts";
import { useProjectCatalog } from "#ui/entities/project/model/catalog.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
import CodePreview from "#ui/entities/project/ui/CodePreview.vue";
const props = defineProps<{
  node: ProjectMapNode;
  diagram: MapDiagram;
  project: Project;
  topics: Topic[];
  view: ProjectMapView;
  selected: boolean;
  scenarioOpened?: boolean;
  relatedModules?: ProjectMapNode[];
  topicLink: (id: string) => { path: string; query: Record<string, string> };
}>();
const emit = defineEmits<{
  choose: [node: ProjectMapNode];
  close: [];
  scenario: [node: ProjectMapNode];
}>();
const catalog = useProjectCatalog(),
  tab = ref("description"),
  expanded = ref(false),
  copied = ref("");
const panelId = useId();
const titleElement = ref<HTMLElement>();
watch(
  () => [props.node.id, props.selected],
  async () => {
    if (props.selected && window.matchMedia("(max-width:1000px)").matches) {
      await nextTick();
      titleElement.value?.focus({ preventScroll: true });
    }
  },
);
const relations = computed(() => {
  const groups = mapRelations(
    props.diagram,
    props.node,
    props.view,
    props.project.name,
  );
  const linked = new Set(
    groups.flatMap((group) => group.items.map((item) => item.node.id)),
  );
  const modules = (props.relatedModules || []).filter(
    (node) => !linked.has(node.id),
  );
  if (modules.length)
    groups.push({
      title: "Связанные разделы",
      items: modules.map((node) => ({ node, label: "" })),
    });
  return groups;
});
const materials = computed(() => mapMaterials(props.node, props.topics));
const tabs = computed(() => [
  { id: "description", label: "Описание", disabled: false },
  { id: "relations", label: "Связи", disabled: !relations.value.length },
  {
    id: "materials",
    label: "Материалы",
    disabled:
      !materials.value.topics.length && !materials.value.references.length,
  },
]);
const description = computed(() => {
  const text = props.node.description;
  if (expanded.value || text.length <= 420) return text;
  const end = text.lastIndexOf(" ", 420);
  return text.slice(0, end > 250 ? end : 420) + "…";
});
watch(
  () => props.node.id,
  () => {
    tab.value = "description";
    expanded.value = false;
    copied.value = "";
  },
);
function moveTab(event: KeyboardEvent, index: number) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const available = tabs.value.filter((item) => !item.disabled);
  const current = available.findIndex(
    (item) => item.id === tabs.value[index].id,
  );
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? available.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : available.length - 1)) %
          available.length;
  tab.value = available[next].id;
  (event.currentTarget as HTMLElement).parentElement
    ?.querySelector<HTMLButtonElement>(`[data-inspector-tab="${tab.value}"]`)
    ?.focus();
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = "Путь скопирован";
  } catch {
    copied.value = "Не удалось скопировать путь";
  }
}
function referenceUrl(reference: CodeStep) {
  const owner = props.topics.find((topic) =>
    topic.pilot.code.steps.some(
      (step) =>
        step.path === reference.path &&
        step.project === reference.project &&
        step.line === reference.line,
    ),
  );
  return sourceUrl(
    reference,
    catalog.catalog.repositories,
    reference.preview?.revision || owner?.pilot.sourceRevision || "main",
  );
}
</script>
<template>
  <aside
    class="map-inspector"
    :class="{ 'is-selected': selected }"
    aria-label="Выбранный элемент карты"
    @keydown.esc="emit('close')"
  >
    <header class="map-inspector-header">
      <div class="map-inspector-title">
        <h3 ref="titleElement" tabindex="-1">{{ node.label }}</h3>
        <button
          v-if="selected"
          aria-label="Закрыть сведения"
          @click="emit('close')"
        >
          ×
        </button>
      </div>
      <nav role="tablist" aria-label="Сведения об элементе">
        <button
          v-for="(item, index) in tabs"
          :id="panelId + '-' + item.id"
          :key="item.id"
          role="tab"
          :data-inspector-tab="item.id"
          :aria-selected="tab === item.id"
          :aria-controls="panelId + '-content'"
          :tabindex="tab === item.id ? 0 : -1"
          :disabled="item.disabled"
          @click="tab = item.id"
          @keydown="moveTab($event, index)"
        >
          {{ item.label }}
        </button>
      </nav>
    </header>
    <div
      :id="panelId + '-content'"
      class="map-inspector-content"
      role="tabpanel"
      :aria-labelledby="panelId + '-' + tab"
    >
      <template v-if="tab === 'description'">
        <MarkdownContent :text="description" />
        <button
          v-if="node.description.length > 420"
          class="small-btn"
          @click="expanded = !expanded"
        >
          {{ expanded ? "Свернуть" : "Читать полностью" }}
        </button>
        <button
          v-if="node.steps?.length && !scenarioOpened"
          class="platform-button primary map-open-scenario"
          data-action="open-scenario"
          @click="emit('scenario', node)"
        >
          Показать сценарий →
        </button>
        <RouterLink
          v-if="materials.topics.length === 1"
          class="map-primary-link"
          :to="topicLink(materials.topics[0].id)"
          >Открыть разбор →</RouterLink
        >
      </template>
      <template v-else-if="tab === 'relations'">
        <section
          v-for="group in relations"
          :key="group.title"
          class="map-relation-group"
        >
          <h4>{{ group.title }}</h4>
          <ul>
            <li v-for="item in group.items" :key="item.node.id + item.label">
              <button @click="emit('choose', item.node)">
                {{ item.node.label }} <span aria-hidden="true">→</span>
              </button>
              <p v-if="item.label">{{ item.label }}</p>
            </li>
          </ul>
        </section>
      </template>
      <template v-else>
        <section v-if="materials.topics.length" class="map-topic-materials">
          <h4>Темы · {{ materials.topics.length }}</h4>
          <RouterLink
            v-for="topic in materials.topics"
            :key="topic.id"
            :to="topicLink(topic.id)"
            >{{ topic.title }} →</RouterLink
          >
        </section>
        <details
          v-if="materials.references.length"
          :key="node.id"
          class="project-map-code"
        >
          <summary>Код · {{ materials.references.length }}</summary>
          <section
            v-for="reference in materials.references"
            :key="reference.project + reference.path + reference.line"
            class="map-code-reference"
          >
            <h4>{{ reference.title }}</h4>
            <a
              v-if="referenceUrl(reference)"
              :href="referenceUrl(reference)!"
              target="_blank"
              rel="noopener noreferrer"
              >{{ reference.path }}:{{ reference.line }} ↗</a
            >
            <button v-else @click="copy(localCodeReference(reference))">
              {{ reference.path }}:{{ reference.line }}
            </button>
            <MarkdownContent :text="codePresentation(reference).explanation" />
            <CodePreview
              v-if="codePresentation(reference).preview"
              :preview="codePresentation(reference).preview!"
              :path="reference.path"
            />
          </section>
        </details>
        <p v-if="copied" role="status">{{ copied }}</p>
      </template>
    </div>
  </aside>
</template>
<style scoped>
.map-inspector {
  background: white;
  border: 1px solid var(--line);
  border-radius: 12px;
  min-width: 0;
  height: 620px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overflow-anchor: none;
}
.map-inspector-header {
  padding: 20px 20px 0;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  flex-shrink: 0;
}
.map-inspector-title {
  display: flex;
  gap: 12px;
  align-items: start;
  justify-content: space-between;
}
.map-inspector-title h3 {
  margin: 0 0 16px;
  font-size: 19px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.map-inspector-title button {
  padding: 0;
  min-width: 32px;
  min-height: 32px;
  font-size: 22px;
  background: transparent;
  border: 0;
}
[role="tablist"] {
  display: flex;
  gap: 8px;
}
[role="tab"] {
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 10px 2px;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  min-height: 40px;
}
[role="tab"][aria-selected="true"] {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
[role="tab"]:disabled {
  opacity: 0.4;
}
.map-inspector-content {
  padding: 20px;
  overflow: auto;
  min-height: 0;
  font-size: 14px;
}
.map-inspector-content :deep(p) {
  font-size: 14px;
  line-height: 1.65;
  margin-top: 0;
}
.map-inspector-content h4 {
  margin: 0 0 12px;
  font-size: 14px;
}
.map-open-scenario {
  margin-top: 16px;
  width: 100%;
  font-size: 13px;
}
.map-primary-link {
  display: block;
  margin-top: 20px;
}
.map-relation-group + section {
  margin-top: 24px;
}
.map-relation-group ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.map-relation-group li {
  margin: 0 0 16px;
}
.map-relation-group button {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  text-align: left;
  border: 0;
  background: var(--surface);
  font-size: 14px;
  padding: 10px 12px;
  color: var(--accent);
}
.map-relation-group p {
  margin: 6px 0 0 !important;
  font-size: 12px !important;
  color: var(--muted);
}
.map-topic-materials a {
  display: block;
  margin-bottom: 16px;
}
.project-map-code {
  margin-top: 24px;
}
.project-map-code summary {
  cursor: pointer;
  font-weight: 600;
}
.map-code-reference {
  padding-top: 20px;
}
.map-code-reference > a,
.map-code-reference > button {
  font-size: 12px;
  overflow-wrap: anywhere;
  text-align: left;
}
.map-code-reference :deep(pre) {
  max-height: 300px;
}
@media (max-width: 1000px) {
  .map-inspector {
    display: none;
  }
  .map-inspector.is-selected {
    display: flex;
    position: fixed;
    z-index: 40;
    inset: auto 8px 8px;
    height: min(65dvh, 620px);
    box-shadow: 0 -8px 40px #202c4033;
    border-radius: 16px;
  }
  .map-inspector-title h3 {
    font-size: 17px;
  }
}
</style>
