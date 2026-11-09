<script setup lang="ts">
import {
  ref,
  shallowRef,
  watch,
  nextTick,
  onBeforeUnmount,
  computed,
} from "vue";
import type { MapDiagram, ProjectMapNode } from "#domain/projects/map.ts";
import { mapViewports as positions } from "#ui/features/review-project/model/map-viewport.ts";
import {
  layoutGraph,
  type GraphLayout,
} from "#domain/projects/graph-layout.ts";
const props = defineProps<{
  diagram: MapDiagram;
  selected?: string;
  scope: string;
  direction?: "RIGHT" | "DOWN";
}>();
const emit = defineEmits<{ choose: [node: ProjectMapNode]; clear: [] }>();
const layout = shallowRef<GraphLayout>({
  nodes: [],
  edges: [],
  width: 320,
  height: 160,
});
const frame = ref<HTMLElement>(),
  zoom = ref(1),
  x = ref(24),
  y = ref(24),
  busy = ref(false),
  error = ref("");
let generation = 0,
  observer: ResizeObserver | undefined;
let drag:
  | { id: number; x: number; y: number; startX: number; startY: number }
  | undefined;
const selectedEdges = computed(() =>
  layout.value.edges.filter(
    (edge) => edge.from === props.selected || edge.to === props.selected,
  ),
);
function fit(initial = false) {
  const el = frame.value;
  if (!el) return;
  zoom.value = Math.max(
    initial ? 0.8 : 0.4,
    Math.min(
      1,
      (el.clientWidth - 48) / layout.value.width,
      (el.clientHeight - 48) / layout.value.height,
    ),
  );
  x.value = Math.max(
    24,
    (el.clientWidth - layout.value.width * zoom.value) / 2,
  );
  y.value = Math.max(
    24,
    (el.clientHeight - layout.value.height * zoom.value) / 2,
  );
}
function scale(value: number, origin?: { x: number; y: number }) {
  const el = frame.value;
  if (!el) return;
  const point = origin || { x: el.clientWidth / 2, y: el.clientHeight / 2 };
  const next = Math.max(0.4, Math.min(1.8, value));
  x.value = point.x - ((point.x - x.value) * next) / zoom.value;
  y.value = point.y - ((point.y - y.value) * next) / zoom.value;
  zoom.value = next;
}
function pointerDown(event: PointerEvent) {
  if (event.button !== 0 || (event.target as Element).closest("button")) return;
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    startX: x.value,
    startY: y.value,
  };
  frame.value?.setPointerCapture(event.pointerId);
}
function pointerMove(event: PointerEvent) {
  if (drag?.id === event.pointerId) {
    x.value = drag.startX + event.clientX - drag.x;
    y.value = drag.startY + event.clientY - drag.y;
  }
}
function pointerUp(event: PointerEvent) {
  if (drag?.id === event.pointerId) drag = undefined;
}
function wheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const rect = frame.value!.getBoundingClientRect();
  scale(zoom.value * Math.exp(-event.deltaY * 0.003), {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  });
}
function keyboard(event: KeyboardEvent) {
  if ((event.target as Element).closest("button")) return;
  if (event.key === "Escape") {
    emit("clear");
    return;
  }
  if (
    [
      "+",
      "=",
      "-",
      "0",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
    ].includes(event.key)
  )
    event.preventDefault();
  if (event.key === "+" || event.key === "=") scale(zoom.value + 0.2);
  else if (event.key === "-") scale(zoom.value - 0.2);
  else if (event.key === "0") fit();
  else if (event.key === "ArrowLeft") x.value += 40;
  else if (event.key === "ArrowRight") x.value -= 40;
  else if (event.key === "ArrowUp") y.value += 40;
  else if (event.key === "ArrowDown") y.value -= 40;
}
watch(
  () => ({ diagram: props.diagram, scope: props.scope }),
  async (value, previous) => {
    if (previous)
      positions.set(previous.scope, {
        x: x.value,
        y: y.value,
        zoom: zoom.value,
      });
    const version = ++generation;
    busy.value = true;
    error.value = "";
    try {
      const result = await layoutGraph(value.diagram, props.direction);
      if (version !== generation) return;
      layout.value = result;
      await nextTick();
      const saved = positions.get(value.scope);
      if (saved) {
        x.value = saved.x;
        y.value = saved.y;
        zoom.value = saved.zoom;
      } else fit(true);
      if (frame.value && !observer) {
        observer = new ResizeObserver(() => {
          if (
            frame.value &&
            frame.value.clientWidth &&
            frame.value.clientHeight
          ) {
            x.value = Math.min(x.value, frame.value.clientWidth - 40);
            y.value = Math.min(y.value, frame.value.clientHeight - 40);
          }
        });
        observer.observe(frame.value);
      }
    } catch (cause) {
      if (version === generation)
        error.value =
          cause instanceof Error
            ? cause.message
            : "Не удалось построить схему.";
    } finally {
      if (version === generation) busy.value = false;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  positions.set(props.scope, { x: x.value, y: y.value, zoom: zoom.value });
  generation++;
  observer?.disconnect();
});
</script>
<template>
  <div class="map-canvas-container">
    <div class="project-map-controls">
      <button
        aria-label="Уменьшить карту"
        :disabled="zoom <= 0.4"
        @click="scale(zoom - 0.2)"
      >
        −</button
      ><button aria-label="Сбросить масштаб карты" @click="scale(1)">
        {{ Math.round(zoom * 100) }}%</button
      ><button
        aria-label="Увеличить карту"
        :disabled="zoom >= 1.8"
        @click="scale(zoom + 0.2)"
      >
        +</button
      ><button data-action="fit-map" @click="fit()">Вместить схему</button>
    </div>
    <div
      ref="frame"
      class="project-map-viewport"
      tabindex="0"
      aria-label="Схема проекта"
      :aria-busy="busy"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="pointerUp"
      @wheel="wheel"
      @keydown="keyboard"
    >
      <div v-if="busy" role="status" class="map-canvas-status">
        Строим схему…
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <div
        v-if="!error"
        class="project-map-canvas"
        :style="{
          width: layout.width + 'px',
          height: layout.height + 'px',
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        }"
      >
        <svg :width="layout.width" :height="layout.height" aria-hidden="true">
          <g
            v-for="(edge, index) in layout.edges"
            :key="index"
            class="project-map-connection"
            :class="{
              'is-focused': selectedEdges.includes(edge),
              'is-muted': selected && !selectedEdges.includes(edge),
              'is-hierarchy': edge.kind === 'contains',
            }"
            :data-map-from="edge.from"
            :data-map-to="edge.to"
          >
            <path :d="edge.path" class="project-map-edge" />
            <path v-if="edge.arrow" :d="edge.arrow" class="project-map-arrow" />
            <title>{{ edge.label }}</title>
          </g>
        </svg>
        <button
          v-for="node in layout.nodes"
          :key="node.id"
          class="project-map-node"
          :class="'node-' + node.kind"
          :style="{ left: node.x + 'px', top: node.y + 'px' }"
          :aria-pressed="selected === node.id"
          :data-map-node="node.id"
          :data-topic-id="
            node.topicIds.length === 1 ? node.topicIds[0] : undefined
          "
          @click="emit('choose', node)"
        >
          <strong>{{ node.label }}</strong>
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.map-canvas-container {
  min-width: 0;
}
.project-map-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.project-map-controls button {
  min-width: 40px;
  padding: 7px 12px;
  font-size: 13px;
}
.project-map-viewport {
  position: relative;
  overflow: hidden;
  height: 564px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #f8faff;
  touch-action: none;
  cursor: grab;
  overflow-anchor: none;
}
.project-map-viewport:active {
  cursor: grabbing;
}
.project-map-canvas {
  position: absolute;
  inset: 0 auto auto 0;
  transform-origin: top left;
}
.project-map-canvas svg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
}
.project-map-connection {
  color: #9aadc5;
}
.project-map-connection.is-focused {
  color: var(--accent);
}
.project-map-connection.is-muted {
  opacity: 0.22;
}
.project-map-edge {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
}
.is-focused .project-map-edge {
  stroke-width: 2.5;
}
.project-map-arrow {
  fill: currentColor;
}
.is-hierarchy .project-map-edge {
  stroke-dasharray: 4 4;
}
.platform .project-map-node {
  position: absolute;
  width: 220px;
  height: 84px;
  border: 1px solid #c9d6e8;
  border-left: 4px solid #3e9b85;
  border-radius: 10px;
  background: white;
  padding: 14px 16px;
  text-align: left;
  font-size: 14px;
  line-height: 1.4;
  box-shadow: 0 2px 5px #23395b0a;
}
.project-map-node strong {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.platform .node-scenario {
  border-left-color: #5284d6;
}
.platform .node-technology {
  border-left-color: #9a72ca;
}
.platform .node-system {
  border-left-color: #d49c44;
}
.platform .project-map-node[aria-pressed="true"] {
  border-color: var(--accent);
  background: #edf3ff;
}
.map-canvas-status {
  position: absolute;
  z-index: 2;
  top: 12px;
  left: 12px;
  font-size: 13px;
  padding: 6px 12px;
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
}
@media (max-width: 1000px) {
  .project-map-viewport {
    height: 580px;
  }
}
@media (max-width: 600px) {
  .project-map-viewport {
    height: 480px;
  }
}
</style>
