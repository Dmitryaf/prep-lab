<script setup lang="ts">
import type { Question } from "../../../../domain/knowledge/question.ts";
import { useMaterials } from "../../material/model/store.ts";
const { noteFor } = useMaterials();

import { link } from "../../../shared/lib/navigation.ts";
defineProps<{ question: Question }>();
</script>
<template>
  <div class="platform-actions">
    <template
      v-for="l in question.learningLinks || []"
      :key="l.kind + l.noteId + l.heading"
      ><RouterLink
        v-if="noteFor(l.noteId)"
        class="platform-button secondary"
        :to="
          link('themes', {
            note: l.noteId,
            ...(l.heading ? { heading: l.heading } : {}),
          })
        "
        >{{ l.kind === "theory" ? "Изучить тему" : "Решить задачу" }}:
        {{ noteFor(l.noteId)!.title }}</RouterLink
      ></template
    >
    <RouterLink
      v-if="question.noteId"
      class="platform-button secondary"
      :to="
        link('themes', {
          note: question.noteId,
          heading: question.heading || question.title,
        })
      "
      >Карточка в базе</RouterLink
    >
    <RouterLink
      v-if="question.topicId"
      class="platform-button secondary"
      :to="link('projects', { projectTopic: question.topicId })"
      >Проект и реализация в коде</RouterLink
    >
  </div>
</template>
