<script setup lang="ts">
import { reactive, ref } from "vue";
import type {
  IntensiveGoal,
  IntensiveProgram,
} from "#domain/intensive/contracts.ts";
const props = defineProps<{ plan: IntensiveProgram; busy: boolean }>();
defineEmits<{ save: [goal: IntensiveGoal, ids: string[]]; cancel: [] }>();
const search = ref("");
const goal = reactive({ ...props.plan.goal });
const lessons = ref([...props.plan.lessons]);
const selected = ref(
  props.plan.lessons
    .filter((lesson) => !props.plan.hiddenLessonIds?.includes(lesson.id))
    .map((lesson) => lesson.id),
);
function move(index: number, offset: number) {
  const item = lessons.value.splice(index, 1)[0]!;
  lessons.value.splice(index + offset, 0, item);
}
</script>
<template>
  <form
    class="platform-card"
    @submit.prevent="
      $emit(
        'save',
        { ...goal, interviewDate: goal.interviewDate || undefined },
        lessons
          .filter((lesson) => selected.includes(lesson.id))
          .map((lesson) => lesson.id),
      )
    "
  >
    <h2>Настроить программу</h2>
    <label for="edit-intensive-goal">Цель подготовки</label
    ><input
      id="edit-intensive-goal"
      v-model="goal.title"
      required
      maxlength="500"
    />
    <label for="edit-intensive-direction">Направление</label
    ><input
      id="edit-intensive-direction"
      v-model="goal.direction"
      maxlength="500"
    />
    <label for="edit-intensive-date">Дата собеседования, если известна</label
    ><input id="edit-intensive-date" v-model="goal.interviewDate" type="date" />
    <details>
      <summary>Вакансия и пожелания</summary>
      <textarea
        v-model="goal.vacancy"
        aria-label="Вакансия и пожелания"
        maxlength="30000"
      />
    </details>
    <h3>Занятия и порядок</h3>
    <label for="intensive-edit-search">Найти занятие в программе</label
    ><input id="intensive-edit-search" v-model="search" type="search" />
    <ol class="intensive-program-list">
      <li
        v-for="[index, lesson] in [...lessons.entries()].filter(([, lesson]) =>
          lesson.title
            .toLocaleLowerCase('ru')
            .includes(search.trim().toLocaleLowerCase('ru')),
        )"
        :key="lesson.id"
      >
        <label class="intensive-option"
          ><input
            v-model="selected"
            type="checkbox"
            :value="lesson.id"
          /><span>{{ lesson.title }}</span></label
        >
        <div class="intensive-order-actions">
          <button
            type="button"
            :disabled="busy || index === 0"
            :aria-label="`Выше: ${lesson.title}`"
            @click="move(index, -1)"
          >
            ↑</button
          ><button
            type="button"
            :disabled="busy || index === lessons.length - 1"
            :aria-label="`Ниже: ${lesson.title}`"
            @click="move(index, 1)"
          >
            ↓
          </button>
        </div>
      </li>
    </ol>
    <div class="platform-actions">
      <button class="primary" :disabled="busy || !selected.length">
        Сохранить программу</button
      ><button type="button" :disabled="busy" @click="$emit('cancel')">
        Отмена
      </button>
    </div>
  </form>
</template>
