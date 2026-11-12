<script setup lang="ts">
import { ref, watch } from "vue";
import type { IntensiveGoal } from "#domain/intensive/contracts.ts";
import { parseIntensiveProposal } from "#domain/intensive/assistant.ts";

const props = defineProps<{ goal: IntensiveGoal; disabled?: boolean }>();
const emit = defineEmits<{ ordered: [lessonIds: string[]] }>();
const prompt = ref("");
const result = ref("");
const error = ref("");
const message = ref("");
const busy = ref(false);
let requestVersion = 0;
watch(
  () => props.goal,
  () => {
    requestVersion++;
    prompt.value = "";
    result.value = "";
    error.value = "";
    message.value = "";
  },
  { deep: true },
);

async function prepare() {
  const version = ++requestVersion;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    const response = await fetch("/api/intensive/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: props.goal }),
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Не удалось составить задание.");
    if (version !== requestVersion) return;
    if (typeof body.prompt !== "string")
      throw new Error("Сервер вернул неверное задание.");
    prompt.value = body.prompt;
    try {
      await navigator.clipboard.writeText(body.prompt);
      message.value = "Задание скопировано.";
    } catch {
      message.value = "Выделите и скопируйте задание ниже.";
    }
  } catch (failure) {
    if (version === requestVersion)
      error.value =
        failure instanceof Error
          ? failure.message
          : "Не удалось составить задание.";
  } finally {
    busy.value = false;
  }
}

function apply() {
  error.value = "";
  try {
    emit("ordered", parseIntensiveProposal(result.value));
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message
        : "Не удалось прочитать программу.";
  }
}
</script>

<template>
  <details class="intensive-assistant">
    <summary>Подобрать порядок занятий с ИИ</summary>
    <p>Передайте задание своему помощнику и вставьте его ответ.</p>
    <button type="button" :disabled="disabled || busy" @click="prepare">
      {{ busy ? "Подготовка задания…" : "Скопировать задание" }}
    </button>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <details v-if="prompt">
      <summary>Задание для помощника</summary>
      <textarea
        aria-label="Задание для помощника"
        :value="prompt"
        readonly
        rows="8"
      />
    </details>
    <label for="intensive-assistant-result">Ответ помощника</label>
    <textarea
      id="intensive-assistant-result"
      v-model="result"
      rows="5"
      :disabled="disabled || busy"
      spellcheck="false"
    />
    <button
      type="button"
      :disabled="disabled || busy || !result.trim()"
      @click="apply"
    >
      Посмотреть программу
    </button>
  </details>
</template>

<style scoped>
.intensive-assistant {
  margin-top: 1.5rem;
}
summary {
  cursor: pointer;
}
label {
  display: block;
  margin-top: 1rem;
}
textarea {
  display: block;
  width: 100%;
  margin: 0.5rem 0 1rem;
  box-sizing: border-box;
}
</style>
