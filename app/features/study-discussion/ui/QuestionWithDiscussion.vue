<script setup lang="ts">
import type { Question } from "../../../../domain/knowledge/question.ts";
import QuestionCard from "../../../entities/question/ui/QuestionCard.vue";
import StudyDiscussion from "./StudyDiscussion.vue";
defineProps<{ question: Question; revealed?: boolean; followup?: number }>();
</script>
<template>
  <QuestionCard :question="question" :revealed="revealed" :followup="followup"
    ><StudyDiscussion
      v-if="revealed"
      :key="question.id"
      :material-key="'question:' + question.id"
      :title="question.title"
      :context="JSON.stringify(question, null, 2)"
  /></QuestionCard>
</template>
