<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import type {
  IntensiveLesson,
  IntensiveStory,
} from "#domain/intensive/contracts.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
import VoiceInput, { canLeaveVoice } from "#ui/features/voice-input/index.ts";
const props = defineProps<{
  name: string;
  saved?: IntensiveStory;
  lessons: IntensiveLesson[];
  busy: boolean;
  save: (story: IntensiveStory) => Promise<boolean>;
}>();
defineEmits<{ lesson: [id: string] }>();
const fields = [
  { id: "purpose", label: "Для кого проект и какую задачу решает" },
  { id: "scenario", label: "Основной пользовательский сценарий" },
  { id: "structure", label: "Как устроена система" },
  { id: "contribution", label: "Какие задачи я решал" },
  { id: "decisions", label: "Какие решения я выбрал и почему" },
  { id: "constraints", label: "Ограничения и сложные случаи" },
  { id: "result", label: "Что получилось" },
] as const;
const story = reactive<IntensiveStory>({
  purpose: "",
  scenario: "",
  structure: "",
  contribution: "",
  decisions: "",
  constraints: "",
  result: "",
  ...props.saved,
});
const dirty = ref(false);
const failed = ref(false);
const savedNotice = ref(false);
const preview = ref(false);
const markdown = computed(() =>
  fields
    .filter((field) => story[field.id].trim())
    .map((field) => `### ${field.label}\n\n${story[field.id]}`)
    .join("\n\n"),
);
let timer: ReturnType<typeof setTimeout> | undefined;
async function persist() {
  clearTimeout(timer);
  if (!dirty.value) return true;
  const input = { ...story };
  const success = await props.save(input);
  failed.value = !success;
  if (success && JSON.stringify(input) === JSON.stringify(story)) {
    dirty.value = false;
    savedNotice.value = true;
  }
  if (success && dirty.value) return persist();
  return success;
}
function changed() {
  dirty.value = true;
  savedNotice.value = false;
  clearTimeout(timer);
  timer = setTimeout(() => void persist(), 650);
}
function protect(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", protect));
onBeforeUnmount(() => {
  clearTimeout(timer);
  window.removeEventListener("beforeunload", protect);
});
onBeforeRouteLeave(() => persist());
defineExpose({ persist });
</script>
<template>
  <section class="intensive-story">
    <div class="platform-card">
      <p class="platform-meta">{{ name }}</p>
      <h2>Мой рассказ о проекте</h2>
      <div class="platform-actions">
        <button :aria-pressed="!preview" @click="preview = false">
          Редактировать рассказ</button
        ><button
          :aria-pressed="preview"
          :disabled="!markdown"
          @click="canLeaveVoice() && (preview = true)"
        >
          Прочитать целиком
        </button>
      </div>
      <MarkdownContent
        v-if="preview"
        :text="markdown"
        :follow-heading="false"
      />
      <template v-else>
        <details
          v-for="(field, index) in fields"
          :key="field.id"
          :open="index === 0 || !!story[field.id]"
        >
          <summary>{{ field.label }}</summary>
          <VoiceInput
            v-model="story[field.id]"
            :label="field.label"
            :max-length="30000"
            @changed="changed"
            @blur="persist"
          />
        </details>
      </template>
      <div class="platform-actions">
        <button :disabled="busy || !dirty" @click="persist">
          Сохранить рассказ</button
        ><span role="status">{{
          failed
            ? "Рассказ не сохранён"
            : dirty
              ? "Сохраняем…"
              : savedNotice
                ? "Рассказ сохранён"
                : ""
        }}</span
        ><button v-if="failed" :disabled="busy" @click="persist">
          Повторить сохранение рассказа
        </button>
      </div>
    </div>
    <details class="platform-card">
      <summary>Разборы и вопросы проекта</summary>
      <section v-for="lesson in lessons" :key="lesson.id">
        <h3>{{ lesson.reading.title }}</h3>
        <ul>
          <li v-for="question in lesson.questions" :key="question.id">
            {{ question.title }}
          </li>
        </ul>
        <button :disabled="busy" @click="$emit('lesson', lesson.id)">
          Открыть занятие
        </button>
      </section>
    </details>
  </section>
</template>
