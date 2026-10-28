<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>
<template>
  <div class="platform-eyebrow">ПОДГОТОВКА К СОБЕСЕДОВАНИЯМ</div>
  <h1>{{ title }}</h1>
  <p v-if="description" class="platform-lead">{{ description }}</p>
</template>
