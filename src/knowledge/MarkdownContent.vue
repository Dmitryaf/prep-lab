<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { renderMarkdown, headingId } from "./markdown.js";
import { resolveKnowledgeLink } from "./links.js";
import { noteFor } from "../app/store";
import { router, link } from "../app/router";
const props = withDefaults(defineProps<{ text: string; sourceId?: string }>(), {
  sourceId: "",
});
const route = useRoute();
function resolveTarget(raw: string) {
  return resolveKnowledgeLink(raw, props.sourceId, noteFor, (id: string, heading: string) =>
    router.resolve(link("themes", { note: id, ...(heading ? { heading } : {}) })).href,
  );
}
const html = computed(() =>
  renderMarkdown(props.text, { resolveLink: resolveTarget }),
);
// The only HTML boundary is the existing escaping Markdown renderer, never raw source.
function follow(event: MouseEvent) {
  const a = (event.target as Element).closest("a");
  if (
    !a ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  )
    return;
  const href = a.getAttribute("href");
  if (href?.startsWith("#/")) {
    event.preventDefault();
    void router.push(href.slice(1));
  }
}
watch(
  () => [props.text, route.query.heading],
  async () => {
    await nextTick();
    if (typeof route.query.heading === "string") {
      const el = document.getElementById(headingId(route.query.heading));
      if (el) {
        for (let p = el.parentElement; p; p = p.parentElement)
          if (p instanceof HTMLDetailsElement) p.open = true;
        el.scrollIntoView({ block: "start" });
      }
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="platform-markdown" @click="follow" v-html="html" />
</template>
