<script setup lang="ts">
import { computed } from "vue";
import type { Question } from "#domain/knowledge/question.ts";
import { studyTopics } from "#domain/knowledge/study-topics.ts";
import { useMaterials } from "#ui/entities/material/model/store.ts";
const materials = useMaterials();

import { link } from "#ui/shared/lib/navigation.ts";
const props = defineProps<{ question: Question; variant?: "list" }>();
const items = computed(() => {
  const question = props.question;
  const latest =
    props.variant === "list"
      ? materials.knowledge.questions.find((item) => item.id === question.id)
      : undefined;
  const learningLinks = [
    ...(question.learningLinks || []),
    ...(latest?.learningLinks || []),
  ];
  const result: { to: ReturnType<typeof link>; title: string }[] = [];
  if (props.variant === "list") {
    for (const topic of studyTopics(
      { ...question, learningLinks },
      materials.knowledge.notes,
    )) {
      result.push({
        to: link("themes", {
          note: topic.noteId,
          ...(topic.heading ? { heading: topic.heading } : {}),
        }),
        title: `Изучить тему: ${topic.title}`,
      });
    }
  }
  for (const item of learningLinks) {
    const note = materials.noteFor(item.noteId);
    if (!note) continue;
    result.push({
      to: link("themes", {
        note: note.id,
        ...(item.heading ? { heading: item.heading } : {}),
      }),
      title: `${item.kind === "theory" ? "Изучить тему" : "Решить задачу"}: ${note.title}`,
    });
  }
  if (question.noteId)
    result.push({
      to: link("themes", {
        note: question.noteId,
        heading: question.heading || question.title,
      }),
      title: "Карточка в базе",
    });
  if (question.topicId)
    result.push({
      to: link("projects", { projectTopic: question.topicId }),
      title: "Проект и реализация в коде",
    });
  const keyed = result.map((item) => ({
    ...item,
    key: JSON.stringify([item.to.path, Object.entries(item.to.query).sort()]),
  }));
  return keyed.filter(
    (item, index) =>
      keyed.findIndex((candidate) => candidate.key === item.key) === index,
  );
});
</script>
<template>
  <nav
    v-if="items.length"
    :class="variant === 'list' ? 'study-links-list' : 'platform-actions'"
    aria-label="Материалы вопроса"
  >
    <h3 v-if="variant === 'list'">Материалы</h3>
    <RouterLink
      v-for="item in items"
      :key="item.key"
      :class="variant !== 'list' && 'platform-button secondary'"
      :to="item.to"
      >{{ item.title }}</RouterLink
    >
  </nav>
</template>
<style scoped>
.study-links-list {
  display: grid;
  gap: 0;
  padding: 18px 22px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface, #f6f8fc);
}
.study-links-list h3 {
  margin: 0 0 4px;
  font-size: 16px;
}
.study-links-list a {
  padding: 11px 0;
  font-size: 14px;
  line-height: 1.6;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.study-links-list a + a {
  border-top: 1px solid var(--line);
}
.study-links-list a:hover {
  text-decoration: underline;
}
.study-links-list a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
</style>
