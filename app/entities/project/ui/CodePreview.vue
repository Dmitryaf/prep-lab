<script setup lang="ts">
import { computed, ref } from "vue";
import type { CodePreview } from "#domain/projects/code.ts";
import { highlightCode } from "#domain/knowledge/highlighting.ts";
import { escapeHtml } from "#ui/entities/material/lib/markdown.ts";
const props = defineProps<{ preview: CodePreview; path: string }>();
const opened = ref(false),
  message = ref("");
const lines = computed(() =>
  opened.value
    ? props.preview.text
        .split("\n")
        .map(
          (text) =>
            highlightCode(text, props.path.split(".").at(-1) || "") ??
            escapeHtml(text),
        )
    : [],
);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.preview.text);
    message.value = "Код скопирован";
  } catch {
    message.value = "Не удалось скопировать код";
  }
}
</script>
<template>
  <details
    class="code-preview"
    @toggle="opened = ($event.target as HTMLDetailsElement).open"
  >
    <summary>{{ opened ? "Скрыть код" : "Показать код" }}</summary>
    <template v-if="opened">
      <div class="code-preview-toolbar">
        <span
          >{{ path
          }}<template v-if="preview.revision">
            · {{ preview.revision.slice(0, 8) }}</template
          ></span
        ><button class="small-btn" @click="copy">Копировать код</button
        ><span role="status">{{ message }}</span>
      </div>
      <!-- eslint-disable vue/no-v-html -- highlightCode and escapeHtml escape source markup; browser tests cover inert HTML. -->
      <pre
        tabindex="0"
        aria-label="Код проекта"
      ><span v-for="(line, index) in lines" :key="index" class="code-line"><span class="code-line-number" aria-hidden="true">{{ preview.startLine + index }}</span><code v-html="line || ' '" /></span></pre>
      <!-- eslint-enable vue/no-v-html -->
    </template>
  </details>
</template>
<style scoped>
.code-preview {
  min-width: 0;
  margin-block: 12px;
}
.code-preview summary {
  cursor: pointer;
  color: var(--accent);
}
.code-preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-block: 12px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.code-preview pre {
  margin: 0;
  padding: 12px 0;
  max-height: 440px;
  overflow: auto;
  font:
    14px/1.7 Consolas,
    monospace;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.code-line {
  display: flex;
  min-width: max-content;
}
.code-line-number {
  position: sticky;
  left: 0;
  min-width: 4.5em;
  padding-right: 1em;
  text-align: right;
  color: var(--muted);
  background: var(--surface);
  user-select: none;
}
.code-line code {
  font: inherit;
  padding: 0 16px 0 0;
  color: inherit;
  background: none;
}
.code-preview :deep(.hljs-comment),
.code-preview :deep(.hljs-quote) {
  color: #57657a;
}
.code-preview :deep(.hljs-keyword),
.code-preview :deep(.hljs-selector-tag) {
  color: #7c279f;
}
.code-preview :deep(.hljs-string),
.code-preview :deep(.hljs-regexp) {
  color: #17663c;
}
.code-preview :deep(.hljs-number),
.code-preview :deep(.hljs-literal) {
  color: #9b3e00;
}
.code-preview :deep(.hljs-title),
.code-preview :deep(.hljs-built_in),
.code-preview :deep(.hljs-name) {
  color: #135ca7;
}
.code-preview :deep(.hljs-attr),
.code-preview :deep(.hljs-attribute),
.code-preview :deep(.hljs-selector-class) {
  color: #805400;
}
.code-preview :deep(.hljs-type),
.code-preview :deep(.hljs-variable),
.code-preview :deep(.hljs-tag) {
  color: #116579;
}
</style>
