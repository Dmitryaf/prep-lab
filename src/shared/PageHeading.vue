<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>
<template>
  <header class="page-heading">
  <h1>{{ title }}</h1>
  <p v-if="description" class="platform-lead">{{ description }}</p>
  </header>
</template>
