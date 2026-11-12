<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useMaterials } from "#ui/entities/material/model/store.ts";
import LoadingState from "#ui/shared/ui/LoadingState.vue";
defineProps<{ compact?: boolean }>();
const materials = useMaterials();
const { loading, ready, unavailable } = storeToRefs(materials);
</script>

<template>
  <LoadingState
    v-if="loading"
    label="Загружаем материалы…"
    :compact="ready || compact"
  />
  <div v-else-if="unavailable" class="platform-card" role="alert">
    <p>{{ unavailable }}</p>
    <button @click="materials.fetchKnowledge">
      Повторить загрузку материалов
    </button>
  </div>
</template>
