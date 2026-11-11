<script setup lang="ts">
import { computed, ref } from "vue";
import type { IntensiveProgram } from "#domain/intensive/contracts.ts";
import { questionCount } from "#ui/features/intensive/model/presentation.ts";
const props = defineProps<{
  draft: IntensiveProgram;
  busy: boolean;
  existingIds: string[];
}>();
defineEmits<{ accept: [lessonIds: string[]]; back: [] }>();
const selected = ref(
  props.draft.lessons
    .filter((lesson) => !props.existingIds.includes(lesson.id))
    .map((lesson) => lesson.id),
);
const selectedLessons = computed(() =>
  selected.value.flatMap((id) => {
    const lesson = props.draft.lessons.find((item) => item.id === id);
    return lesson ? [lesson] : [];
  }),
);
const otherLessons = computed(() =>
  props.draft.lessons.filter(
    (lesson) =>
      !selected.value.includes(lesson.id) &&
      !props.existingIds.includes(lesson.id),
  ),
);
function move(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= selected.value.length) return;
  const moved = selected.value.splice(index, 1)[0]!;
  selected.value.splice(target, 0, moved);
}
</script>

<template>
  <section class="platform-card intensive-editor">
    <p class="platform-meta">Предпросмотр программы</p>
    <h2>{{ draft.goal.title }}</h2>
    <p v-if="existingIds.length" class="intensive-muted">
      Новые занятия дополнят вашу программу. Пройденные занятия сохранятся.
    </p>
    <ol class="intensive-program-list">
      <li v-for="(lesson, index) in selectedLessons" :key="lesson.id">
        <div class="intensive-lesson-summary">
          <strong>{{ lesson.title }}</strong
          ><span
            >{{ lesson.kind === "project" ? "Разбор проекта" : "Тема" }} ·
            {{
              lesson.questions.length
                ? questionCount(lesson.questions.length)
                : "Чтение"
            }}</span
          >
        </div>
        <div class="intensive-order-actions">
          <button
            type="button"
            :disabled="busy || index === 0"
            :aria-label="`Выше: ${lesson.title}`"
            @click="move(index, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            :disabled="busy || index === selected.length - 1"
            :aria-label="`Ниже: ${lesson.title}`"
            @click="move(index, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            :disabled="busy"
            :aria-label="`Убрать: ${lesson.title}`"
            @click="selected.splice(index, 1)"
          >
            Убрать
          </button>
        </div>
      </li>
    </ol>
    <p v-if="!selectedLessons.length">Новых занятий не выбрано.</p>
    <details v-if="otherLessons.length">
      <summary>Добавить занятия · {{ otherLessons.length }}</summary>
      <ul class="intensive-available-lessons">
        <li v-for="lesson in otherLessons" :key="lesson.id">
          <span>{{ lesson.title }}</span
          ><button
            type="button"
            :disabled="busy"
            :aria-label="`Добавить: ${lesson.title}`"
            @click="selected.push(lesson.id)"
          >
            Добавить
          </button>
        </li>
      </ul>
    </details>
    <div class="platform-actions">
      <button
        type="button"
        class="primary"
        :disabled="busy || !selected.length"
        @click="$emit('accept', selected)"
      >
        {{ existingIds.length ? "Добавить в программу" : "Начать подготовку" }}
      </button>
      <button type="button" :disabled="busy" @click="$emit('back')">
        Изменить подборку
      </button>
    </div>
  </section>
</template>
