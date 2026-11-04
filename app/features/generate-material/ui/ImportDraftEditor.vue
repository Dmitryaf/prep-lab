<script setup lang="ts">
import type { z } from "zod";
import { importDraftSchema } from "../../../../domain/prompts/contracts.ts";
const draft = defineModel<z.infer<typeof importDraftSchema>>({
  required: true,
});
defineProps<{ disabled: boolean }>();
</script>
<template>
  <section aria-label="Материалы черновика">
    <article v-for="(document, index) in draft.documents" :key="index">
      <h3>Материал {{ index + 1 }}</h3>
      <label :for="'draftPath-' + index">Путь материала {{ index + 1 }}</label
      ><input
        :id="'draftPath-' + index"
        v-model="document.path"
        :disabled="disabled"
      />
      <label :for="'draftProfile-' + index"
        >Профиль материала {{ index + 1 }}</label
      ><select
        :id="'draftProfile-' + index"
        v-model="document.profile"
        :disabled="disabled"
      >
        <option value="shared">Общий</option>
        <option value="vue">Vue</option>
        <option value="react">React</option>
      </select>
      <label :for="'draftKind-' + index"
        >Назначение материала {{ index + 1 }}</label
      ><select
        :id="'draftKind-' + index"
        v-model="document.kind"
        :disabled="disabled"
      >
        <option value="theory">Теория</option>
        <option value="practice">Задачи</option>
        <option value="design">Проектирование</option>
        <option value="behavioral">Поведенческие вопросы</option>
        <option value="reference">Только чтение</option>
      </select>
      <label :for="'draftMarkdown-' + index"
        >Текст материала {{ index + 1 }}</label
      ><textarea
        :id="'draftMarkdown-' + index"
        v-model="document.markdown"
        rows="14"
        :disabled="disabled"
      />
      <button
        type="button"
        :disabled="disabled || draft.documents.length === 1"
        @click="draft.documents.splice(index, 1)"
      >
        Убрать материал {{ index + 1 }}
      </button>
    </article>
  </section>
</template>
