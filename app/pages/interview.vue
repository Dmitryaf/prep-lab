<script setup lang="ts">
import View from "#ui/features/interview-session/ui/InterviewSession.vue";
import { definePageMeta } from "#imports";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import { rememberInterviewPosition } from "#ui/shared/lib/interview-reading-position.ts";
definePageMeta({ keepalive: true });
onBeforeRouteLeave((_to, from) => rememberInterviewPosition(from.fullPath));
onBeforeRouteUpdate((_to, from) => rememberInterviewPosition(from.fullPath));
</script>
<template><View /></template>
