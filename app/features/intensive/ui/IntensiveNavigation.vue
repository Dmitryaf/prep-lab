<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  IntensiveCatalog,
  IntensiveLesson,
  IntensiveProgress,
} from "#domain/intensive/contracts.ts";
import { lessonLocation, lessonGaps } from "#domain/intensive/navigation.ts";
const props = defineProps<{
  lessons: IntensiveLesson[];
  catalog: IntensiveCatalog;
  progress: Record<string, IntensiveProgress>;
  activeId: string;
  busy: boolean;
}>();
defineEmits<{ select: [id: string]; story: [projectId: string] }>();
const search = ref("");
const gapsOnly = ref(false);
const expanded = ref(true);
onMounted(() => {
  expanded.value = !window.matchMedia("(max-width: 850px)").matches;
});
watch(
  () => props.activeId,
  () => {
    if (window.matchMedia("(max-width: 850px)").matches) expanded.value = false;
  },
);
const groups = computed(() => {
  const groups = new Map<
    string,
    {
      owner: string;
      projectId?: string;
      blocks: Map<string, IntensiveLesson[]>;
    }
  >();
  for (const lesson of props.lessons) {
    const location = lessonLocation(lesson, props.catalog);
    const query = search.value.trim().toLocaleLowerCase("ru");
    if (
      query &&
      !`${location.owner} ${location.block} ${location.title} ${lesson.questions.map((q) => q.title).join(" ")} ${Object.values(
        props.progress[lesson.id]?.assessments || {},
      )
        .map((a) => a.note)
        .join(" ")}`
        .toLocaleLowerCase("ru")
        .includes(query)
    )
      continue;
    if (
      gapsOnly.value &&
      !lessonGaps(props.progress[lesson.id]) &&
      props.progress[lesson.id]?.outcome !== "gap"
    )
      continue;
    const key = lesson.projectId || `category:${location.owner}`;
    const group = groups.get(key) || {
      owner: location.owner,
      projectId: lesson.projectId,
      blocks: new Map<string, IntensiveLesson[]>(),
    };
    group.blocks.set(location.block, [
      ...(group.blocks.get(location.block) || []),
      lesson,
    ]);
    groups.set(key, group);
  }
  return [...groups];
});
</script>
<template>
  <details
    class="platform-card intensive-navigation"
    :open="expanded"
    @toggle="expanded = ($event.target as HTMLDetailsElement).open"
  >
    <summary>Программа подготовки</summary>
    <label for="intensive-lesson-search">Найти занятие</label>
    <input
      id="intensive-lesson-search"
      v-model="search"
      type="search"
      placeholder="Проект, тема или вопрос"
    />
    <label class="intensive-option"
      ><input v-model="gapsOnly" type="checkbox" /><span
        >Нужно разобраться</span
      ></label
    >
    <div class="intensive-groups">
      <details
        v-for="[id, group] in groups"
        :key="id"
        :open="
          !!search ||
          gapsOnly ||
          [...group.blocks.values()]
            .flat()
            .some((lesson) => lesson.id === activeId)
        "
      >
        <summary>{{ group.owner }}</summary>
        <button
          v-if="group.projectId"
          class="intensive-story-link"
          :disabled="busy"
          @click="$emit('story', group.projectId)"
        >
          Мой рассказ о проекте
        </button>
        <section v-for="[block, lessonsInBlock] in group.blocks" :key="block">
          <h3>{{ block }}</h3>
          <ol class="intensive-queue">
            <li v-for="lesson in lessonsInBlock" :key="lesson.id">
              <button
                :aria-current="lesson.id === activeId ? 'true' : undefined"
                :disabled="busy"
                @click="$emit('select', lesson.id)"
              >
                <span>{{ lessonLocation(lesson, catalog).title }}</span>
                <small v-if="lessonGaps(progress[lesson.id])"
                  >Разобрать вопросов:
                  {{ lessonGaps(progress[lesson.id]) }}</small
                >
                <small v-else-if="progress[lesson.id]?.outcome === 'gap'"
                  >Нужно разобраться</small
                >
                <small v-else>{{
                  progress[lesson.id]?.status === "done"
                    ? "Пройдено"
                    : progress[lesson.id]?.status === "in-progress"
                      ? "Продолжить"
                      : "Не начато"
                }}</small>
              </button>
            </li>
          </ol>
        </section>
      </details>
      <p v-if="!groups.length">Занятия не найдены.</p>
    </div>
  </details>
</template>
