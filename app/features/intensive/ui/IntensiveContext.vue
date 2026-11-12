<script setup lang="ts">
import type { IntensiveContext } from "#domain/intensive/context.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
import CodePreview from "#ui/entities/project/ui/CodePreview.vue";
defineProps<{ context: IntensiveContext }>();
</script>
<template>
  <div class="intensive-context">
    <details v-if="context.map.nodes.length" class="platform-card">
      <summary>Сценарий в системе</summary>
      <ol class="intensive-scenario-map">
        <li v-for="node in context.map.nodes" :key="node.id">
          <strong>{{ node.label }}</strong>
          <p>{{ node.description }}</p>
          <ol v-if="node.steps?.length">
            <li v-for="step in node.steps" :key="step.id">
              <strong>{{ step.label }}</strong>
              <p>{{ step.description }}</p>
            </li>
          </ol>
          <p
            v-for="edge in context.map.edges.filter(
              (edge) => edge.from === node.id,
            )"
            :key="edge.to"
            class="intensive-map-connection"
          >
            {{ edge.label }} →
            {{ context.map.nodes.find((item) => item.id === edge.to)?.label }}
          </p>
        </li>
      </ol>
    </details>
    <details v-if="context.code.length" class="platform-card">
      <summary>Как это устроено в коде</summary>
      <section
        v-for="(step, index) in context.code"
        :key="index"
        class="intensive-code-step"
      >
        <h3>{{ step.title }}</h3>
        <MarkdownContent :text="step.explanation" :follow-heading="false" />
        <p class="intensive-code-path">
          {{ step.path }}:{{ step.line }} · {{ step.symbol }}
        </p>
        <CodePreview
          v-if="step.preview"
          :preview="step.preview"
          :path="step.path"
        />
      </section>
    </details>
    <details v-if="context.materials.length" class="platform-card">
      <summary>Связанные темы</summary>
      <details v-for="material in context.materials" :key="material.id">
        <summary>{{ material.title }}</summary>
        <p v-if="material.why">{{ material.why }}</p>
        <MarkdownContent
          :text="material.markdown"
          :source-id="material.id"
          :follow-heading="false"
        />
      </details>
    </details>
  </div>
</template>
