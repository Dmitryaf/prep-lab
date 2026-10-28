<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { knowledge, noteFor, loading } from "../app/store";
import { link } from "../app/router";
import { topics, projects } from "../projects/catalog";
import { canonicalNotePath } from "./path.js";
import PageHeading from "../shared/PageHeading.vue";
import MarkdownContent from "./MarkdownContent.vue";
import QuestionList from "../shared/QuestionList.vue";
const route = useRoute(),
  router = useRouter(),
  note = computed(() =>
    noteFor(typeof route.query.note === "string" ? route.query.note : ""),
  );
const linked = computed(() =>
  note.value
    ? topics.filter((t) =>
        t.pilot.study.some((n) => canonicalNotePath(n.path) === note.value!.id),
      )
    : [],
);
const noteQuestions = computed(() =>
  knowledge.value.questions.filter((q) => q.noteId === note.value?.id),
);
const groups = computed(() => {
  const groups = new Map<string, typeof knowledge.value.notes>();
  for (const n of knowledge.value.notes) {
    const name = n.path.split("/")[0];
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(n);
  }
  return [...groups];
});
function back() {
  if (window.history.state.back) router.back();
  else void router.push("/themes");
}
</script>
<template>
  <template v-if="route.query.note"
    ><button class="platform-back" data-action="back" @click="back">
      ← Вернуться</button
    ><template v-if="note"
      ><article class="platform-card platform-note">
        <div class="platform-meta">{{ note.category }}</div>
        <MarkdownContent
          :key="note.id"
          :text="note.markdown"
          :source-id="note.id"
        />
      </article>
      <details v-if="noteQuestions.length" class="platform-card">
        <summary>
          Вопросы по этому материалу ({{ noteQuestions.length }})
        </summary>
        <QuestionList :items="noteQuestions" />
      </details>
      <section v-if="linked.length">
        <h2>Примеры из проектов</h2>
        <RouterLink
          v-for="t in linked"
          :key="t.id"
          class="platform-list-row"
          :to="link('projects', { projectTopic: t.id })"
          >{{ projects[t.project].name }} · {{ t.title
          }}<span>→</span></RouterLink
        >
      </section></template
    ><template v-else
      ><PageHeading title="Материал недоступен" />
      <p>
        {{
          loading
            ? "Подключаем каталог…"
            : "Эта заметка не подключена, исключена из учебного каталога или была переименована."
        }}
      </p></template
    ></template
  >
  <template v-else
    ><PageHeading
      title="Темы"
      description="Теория и практические материалы из вашей локальной базы знаний."
    />
    <p v-if="loading">Подключаем каталог…</p>
    <details
      v-for="[title, notes] in groups"
      :key="title"
      class="platform-card"
      :open="title === 'Фронтенд'"
    >
      <summary>{{ title }} · {{ notes.length }}</summary>
      <div class="platform-note-list">
        <RouterLink
          v-for="n in notes"
          :key="n.id"
          :to="link('themes', { note: n.id })"
          >{{ n.title
          }}<small>{{
            n.path.split("/").slice(1, -1).join(" / ")
          }}</small></RouterLink
        >
      </div>
    </details></template
  >
</template>
