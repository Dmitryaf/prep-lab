<script setup lang="ts">
import { computed } from "vue";
import { usePreparation } from "../../../entities/preparation/model/store.ts";
import { useAnswerAttempts, hasChanges } from "../model/store.ts";
const props = defineProps<{
  questionId: string;
  sessionId?: string;
  readonly?: boolean;
}>();
const attempts = useAnswerAttempts();
const preparation = usePreparation();
const draft = computed(() =>
  attempts.draftFor(props.questionId, props.sessionId),
);
const dirty = computed(() => hasChanges(draft.value));
</script>
<template>
  <section
    v-if="!readonly || draft.text || draft.solutionUrl"
    class="answer-attempt"
    aria-label="Самостоятельная попытка"
  >
    <h3 v-if="readonly">Моя попытка</h3>
    <template v-if="readonly">
      <pre v-if="draft.text">{{ draft.text }}</pre>
      <a
        v-if="draft.solutionUrl && !dirty"
        :href="draft.solutionUrl"
        target="_blank"
        rel="noopener noreferrer"
        >Открыть моё решение</a
      >
      <p v-else-if="draft.solutionUrl">{{ draft.solutionUrl }}</p>
    </template>
    <form v-else @submit.prevent="attempts.save(questionId, sessionId)">
      <label
        >Моя попытка<textarea
          v-model="draft.text"
          rows="5"
          maxlength="20000"
          placeholder="Ответьте своими словами, запишите ход решения или код. Это необязательно."
        />
      </label>
      <label
        >Ссылка на решение<input
          v-model="draft.solutionUrl"
          type="url"
          maxlength="2000"
          placeholder="https://…"
      /></label>
      <button
        type="submit"
        :disabled="
          !dirty || draft.saving || preparation.saving || !preparation.ready
        "
      >
        Сохранить попытку
      </button>
    </form>
    <button
      v-if="readonly && dirty"
      :disabled="draft.saving || preparation.saving || !preparation.ready"
      @click="attempts.save(questionId, sessionId)"
    >
      Сохранить попытку
    </button>
    <p v-if="draft.error" role="alert">{{ draft.error }}</p>
    <p
      v-if="draft.saving || dirty || draft.saved"
      role="status"
      class="platform-muted"
    >
      {{
        draft.saving
          ? "Сохраняем попытку…"
          : dirty
            ? "Есть несохранённые изменения. Сохраните попытку перед перезагрузкой страницы."
            : "Попытка сохранена."
      }}
    </p>
  </section>
</template>
<style scoped>
.answer-attempt {
  margin-block: 1rem;
  padding: 1rem;
  border: 1px solid var(--line, #d8dce3);
  border-radius: 12px;
  overflow-wrap: anywhere;
}
form,
label {
  display: grid;
  gap: 0.5rem;
}
form {
  gap: 0.8rem;
}
textarea,
input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
}
textarea {
  resize: vertical;
}
button {
  justify-self: start;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
</style>
