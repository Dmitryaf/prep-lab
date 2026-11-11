<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { IntensiveGoal } from "#domain/intensive/contracts.ts";
import type { IntensiveCatalog } from "#ui/features/intensive/api/intensive.ts";
import { questionCount } from "#ui/features/intensive/model/presentation.ts";

const props = defineProps<{
  catalog: IntensiveCatalog;
  initial?: IntensiveGoal;
  busy: boolean;
  hasPlan: boolean;
}>();
defineEmits<{ prepare: [goal: IntensiveGoal]; cancel: [] }>();
const goal = reactive<IntensiveGoal>({
  title: props.initial?.title || "",
  direction: props.initial?.direction || "",
  vacancy: props.initial?.vacancy || "",
  interviewDate: props.initial?.interviewDate || "",
  noteIds: [...(props.initial?.noteIds || [])],
  projectIds: [...(props.initial?.projectIds || [])],
});
const search = ref("");
const categories = computed(() => {
  const groups = new Map<string, IntensiveCatalog["notes"]>();
  const query = search.value.trim().toLocaleLowerCase("ru");
  for (const note of props.catalog.notes) {
    if (
      query &&
      !`${note.title} ${note.category}`.toLocaleLowerCase("ru").includes(query)
    )
      continue;
    const list = groups.get(note.category) || [];
    list.push(note);
    groups.set(note.category, list);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, "ru"));
});
const valid = computed(
  () => goal.title.trim() && (goal.noteIds.length || goal.projectIds.length),
);
const input = computed<IntensiveGoal>(() => ({
  ...goal,
  interviewDate: goal.interviewDate || undefined,
  noteIds: [...goal.noteIds],
  projectIds: [...goal.projectIds],
}));
function selectGroup(notes: IntensiveCatalog["notes"]) {
  const all = notes.every((note) => goal.noteIds.includes(note.id));
  const ids = new Set(goal.noteIds);
  for (const note of notes) {
    if (all) ids.delete(note.id);
    else ids.add(note.id);
  }
  goal.noteIds = [...ids];
}
</script>

<template>
  <form class="intensive-setup" @submit.prevent="$emit('prepare', input)">
    <section class="platform-card intensive-goal">
      <h2>{{ hasPlan ? "Дополнить программу" : "Ваша подготовка" }}</h2>
      <template v-if="hasPlan">
        <p>{{ goal.title }}</p>
        <p v-if="goal.direction" class="intensive-muted">
          {{ goal.direction }}
        </p>
        <p v-if="goal.interviewDate" class="intensive-muted">
          Собеседование: {{ goal.interviewDate }}
        </p>
      </template>
      <template v-else>
        <label for="intensive-goal">Цель подготовки</label>
        <input
          id="intensive-goal"
          v-model="goal.title"
          required
          maxlength="500"
          placeholder="Например, подготовиться к собеседованию по аналитике"
        />
        <div class="intensive-form-row">
          <div>
            <label for="intensive-direction">Направление</label
            ><input
              id="intensive-direction"
              v-model="goal.direction"
              maxlength="200"
              placeholder="Frontend, backend, аналитика…"
            />
          </div>
          <div>
            <label for="intensive-date">Дата собеседования, если известна</label
            ><input
              id="intensive-date"
              v-model="goal.interviewDate"
              type="date"
            />
          </div>
        </div>
        <details>
          <summary>Добавить описание вакансии</summary>
          <label for="intensive-vacancy">Вакансия и пожелания</label>
          <textarea
            id="intensive-vacancy"
            v-model="goal.vacancy"
            rows="5"
            maxlength="20000"
          />
        </details>
      </template>
    </section>
    <section v-if="catalog.projects.length" class="platform-card">
      <h2>Проекты</h2>
      <div class="intensive-project-options">
        <label
          v-for="project in catalog.projects"
          :key="project.id"
          class="intensive-option"
        >
          <input
            v-model="goal.projectIds"
            type="checkbox"
            :value="project.id"
          />
          <span
            ><strong>{{ project.name }}</strong
            ><small
              >{{ project.stack.join(" · ") }} · Тем:
              {{ project.topicCount }}</small
            ></span
          >
        </label>
      </div>
    </section>
    <section class="platform-card">
      <div class="intensive-section-heading">
        <h2>Темы</h2>
        <span>{{ goal.noteIds.length }} выбрано</span>
      </div>
      <label for="intensive-search">Найти тему</label>
      <input
        id="intensive-search"
        v-model="search"
        type="search"
        placeholder="Название или направление"
      />
      <div class="intensive-catalog">
        <details
          v-for="[category, notes] in categories"
          :key="category"
          :open="!!search"
        >
          <summary>
            {{ category }}
            <span class="intensive-muted">· {{ notes.length }}</span>
          </summary>
          <button
            type="button"
            class="intensive-text-button"
            @click="selectGroup(notes)"
          >
            {{
              notes.every((n) => goal.noteIds.includes(n.id))
                ? "Снять выбор раздела"
                : "Выбрать раздел"
            }}
          </button>
          <label v-for="note in notes" :key="note.id" class="intensive-option">
            <input v-model="goal.noteIds" type="checkbox" :value="note.id" />
            <span
              >{{ note.title
              }}<small v-if="note.questionCount">{{
                questionCount(note.questionCount)
              }}</small></span
            >
          </label>
        </details>
        <p v-if="!categories.length">Темы не найдены.</p>
      </div>
      <RouterLink
        v-if="!catalog.notes.length && !catalog.projects.length"
        to="/sources"
        >Добавить свои материалы</RouterLink
      >
    </section>
    <slot name="assistant" :goal="input" :valid="!!valid" />
    <div class="platform-actions">
      <button type="submit" class="primary" :disabled="busy || !valid">
        {{ busy ? "Подготавливаем…" : "Составить программу" }}
      </button>
      <button
        v-if="hasPlan"
        type="button"
        :disabled="busy"
        @click="$emit('cancel')"
      >
        Вернуться к занятиям
      </button>
    </div>
  </form>
</template>
