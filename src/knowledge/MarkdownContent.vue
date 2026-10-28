<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { renderMarkdown, headingId } from "./markdown.js";
import { canonicalNotePath } from "./path.js";
import { noteFor } from "../app/store";
import { router, link } from "../app/router";
const props = withDefaults(defineProps<{ text: string; sourceId?: string }>(), {
  sourceId: "",
});
const route = useRoute();
function resolveTarget(raw: string) {
  if (/^(https?:|mailto:)/i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return null;
  let target: string;
  try {
    target = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const [path, ...fragments] = target.split("#");
  let id = canonicalNotePath(path || props.sourceId);
  if (!noteFor(id) && path) {
    const parts = props.sourceId.split("/").slice(0, -1);
    for (const part of path.split("/")) {
      if (part === "..") parts.pop();
      else if (part !== ".") parts.push(part);
    }
    const relative = canonicalNotePath(parts.join("/"));
    if (noteFor(relative)) id = relative;
  }
  return router.resolve(
    link("themes", {
      note: id,
      ...(fragments.length ? { heading: fragments.join("#") } : {}),
    }),
  ).href;
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
