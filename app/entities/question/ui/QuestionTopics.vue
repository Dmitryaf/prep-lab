<script setup lang="ts">
import { link } from "#ui/shared/lib/navigation.ts";
defineProps<{ topics: { noteId: string; heading: string; title: string }[] }>();
</script>
<template>
  <aside class="question-topics" aria-label="Полезные темы">
    <h3>Полезные темы</h3>
    <ul>
      <li v-for="topic in topics" :key="topic.noteId + '#' + topic.heading">
        <RouterLink
          :to="
            link('themes', {
              note: topic.noteId,
              ...(topic.heading ? { heading: topic.heading } : {}),
            })
          "
        >
          <span>{{ topic.title }}</span
          ><span aria-hidden="true">↗</span>
        </RouterLink>
      </li>
    </ul>
  </aside>
</template>
<style scoped>
.question-topics {
  position: sticky;
  top: 24px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface, #f6f8fc);
  min-width: 0;
}
.question-topics h3 {
  margin: 0 0 12px;
  font-size: 18px;
}
.question-topics ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.question-topics li + li {
  border-top: 1px solid var(--line);
}
.question-topics a {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-block: 13px;
  font-size: 14px;
  line-height: 1.6;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.question-topics a:hover span:first-child {
  text-decoration: underline;
}
.question-topics a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}
@media (max-width: 1050px) {
  .question-topics {
    position: static;
  }
}
</style>
