<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { SourceManager } from "#ui/features/connect-source/index.ts";
import { SourceAnalysis } from "#ui/features/analyze-source/index.ts";
import { AssistantConnection } from "#ui/features/connect-assistant/index.ts";
const route = useRoute();
const manual = computed(
  () => route.query.mode === "manual" || !!route.query.preview,
);
</script>
<template>
  <template v-if="manual"
    ><RouterLink class="platform-back" to="/sources"
      >← К подключению материалов</RouterLink
    ><SourceManager
  /></template>
  <template v-else
    ><SourceAnalysis />
    <details class="analysis-assistant-settings">
      <summary>Настройки помощника</summary>
      <AssistantConnection /></details
  ></template>
</template>
<style scoped>
.analysis-assistant-settings {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
</style>
