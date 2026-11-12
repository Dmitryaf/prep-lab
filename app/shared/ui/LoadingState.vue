<script setup lang="ts">
withDefaults(defineProps<{ label?: string; compact?: boolean }>(), {
  label: "Загружаем данные…",
  compact: false,
});
</script>

<template>
  <div
    class="loading-state"
    :class="{ 'loading-state--compact': compact }"
    role="status"
    aria-live="polite"
  >
    <div class="loading-state__label">
      <span class="loading-state__spinner" aria-hidden="true" />
      <span>{{ label }}</span>
    </div>
    <div v-if="!compact" class="loading-state__preview" aria-hidden="true">
      <span /><span /><span />
    </div>
  </div>
</template>

<style scoped>
.loading-state {
  padding: 24px;
  margin: 16px 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface, #f5f7fb);
  color: var(--muted);
}
.loading-state__label {
  display: flex;
  align-items: center;
  gap: 12px;
}
.loading-state__spinner {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: loading-state-spin 0.9s linear infinite;
}
.loading-state__preview {
  display: grid;
  gap: 12px;
  margin-top: 24px;
  max-width: 620px;
}
.loading-state__preview span {
  display: block;
  height: 10px;
  border-radius: 6px;
  background: var(--line);
  opacity: 0.6;
}
.loading-state__preview span:nth-child(2) {
  width: 86%;
}
.loading-state__preview span:nth-child(3) {
  width: 64%;
}
.loading-state--compact {
  padding: 12px 0;
  margin: 0;
  border: 0;
  background: transparent;
}
@keyframes loading-state-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .loading-state__spinner {
    animation: none;
  }
}
</style>
