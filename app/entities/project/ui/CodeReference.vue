<script setup lang="ts">
import type { CodeStep } from "#domain/projects/types.ts";
import CodePreview from "./CodePreview.vue";
import { computed } from "vue";
import { codePresentation } from "#domain/projects/code.ts";
import { storeToRefs } from "pinia";
import { useProjectCatalog } from "#ui/entities/project/model/catalog.ts";
import {
  sourceUrl as url,
  sourceContext as context,
} from "#domain/projects/sources.ts";
const { catalog } = storeToRefs(useProjectCatalog());
const sourceUrl = (step: CodeStep, revision?: string) =>
  url(step, catalog.value.repositories, revision);
const sourceContext = (step: CodeStep) =>
  context(step, catalog.value.sourceLabels);
const props = defineProps<{
  step: CodeStep;
  revision?: string;
  index: number;
}>();
const presentation = computed(() => codePresentation(props.step));
defineEmits<{ copy: [step: CodeStep] }>();
</script>
<template>
  <li class="code-step">
    <h4>{{ step.title }}</h4>
    <p v-if="sourceContext(step)" class="source-context">
      {{ sourceContext(step) }}
    </p>
    <p>{{ presentation.explanation }}</p>
    <div class="code-symbol">{{ step.symbol }}</div>
    <a
      v-if="sourceUrl(step, revision)"
      class="code-path"
      :href="sourceUrl(step, revision)!"
      target="_blank"
      rel="noopener noreferrer"
      >{{ step.path }}:{{ step.line }} ↗</a
    ><template v-else
      ><div class="code-path">{{ step.path }}:{{ step.line }}</div>
      <button
        class="small-btn"
        data-action="copy-source"
        :data-index="index"
        @click="$emit('copy', step)"
      >
        Копировать путь и функцию
      </button></template
    >
    <CodePreview
      v-if="presentation.preview"
      :preview="presentation.preview"
      :path="step.path"
    />
  </li>
</template>
