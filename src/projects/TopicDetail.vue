<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import type { Topic, CodeStep } from "../shared/types";
import { topics } from "./catalog";
import {useRoute} from 'vue-router';
import { progress, markTopic, notify } from "../app/store";
import { link } from "../app/router";
import { canonicalNotePath } from "../knowledge/path.js";
import { localCodeReference } from "./catalog/implementation.js";
import { highlightedCode } from "./catalog/code-highlights.js";
import CodeReference from "./CodeReference.vue";
import StudyChat from '../assistant/StudyChat.vue';
const props = defineProps<{ topic: Topic; routeNodes?: string[] }>();
const route=useRoute();
const stepLink=(id:string)=>({path:'/projects',query:{...route.query,projectTopic:id}});
const sourceRoot = ref(""),
  fallback = ref(""),
  textarea = ref<HTMLTextAreaElement>();
try {
  sourceRoot.value = localStorage.getItem("project-map-source-root-v1") || "";
} catch {
  /* Copying relative paths remains available. */
}
watch(sourceRoot, (value) => {
  try {
    localStorage.setItem("project-map-source-root-v1", value);
  } catch {
    notify("Не удалось сохранить путь к проекту");
  }
});
const highlights = computed(
  () =>
    highlightedCode(props.topic.pilot) as
      { step: CodeStep; index: number }[] | null,
);
const related = computed(() =>
  topics.filter((t) => props.topic.related.includes(t.id)),
);
const stepIndex = computed(
  () => props.routeNodes?.indexOf(props.topic.id) ?? -1,
);
async function copy(step: CodeStep) {
  const text = localCodeReference(step, sourceRoot.value);
  try {
    await navigator.clipboard.writeText(text);
    notify("Путь, строка и функция скопированы");
  } catch {
    fallback.value = text;
    await nextTick();
    textarea.value?.focus();
    textarea.value?.select();
  }
}
function jump(section:string){
  const heading=document.querySelector<HTMLElement>(`#details [data-section="${section}"] h3`);
  heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'start',behavior:'instant'});
}
const sections=[['explanation','Как это работает'],['study','Что нужно изучить'],['interview','Вопросы на собеседовании'],['code','Реализация в коде']];
</script>
<template>
  <article id="details" class="platform-card project-detail">
    <header class="topic-intro">
    <h1 class="topic-title" tabindex="-1">{{ topic.title }}</h1>
    <p>{{ topic.summary }}</p>
    <p class="platform-meta">
      {{ topic.priority }} · {{ topic.minutes }} мин ·
      {{
        progress.progress[topic.id]?.status === "done"
          ? "✓ Могу объяснить"
          : progress.progress[topic.id]?.status === "again"
            ? "↻ Повторить"
            : "Не проверено"
      }}
    </p>
    <StudyChat :key="topic.id" :material-key="'topic:'+topic.id" :title="topic.title" :context="JSON.stringify(topic,null,2)" />
    </header>
    <details v-if="topic.story">
      <summary>История и границы подтверждённого опыта</summary>
      <p>{{ topic.story.short }}</p>
      <p>{{ topic.story.confirmed }}</p>
      <p>{{ topic.story.reconstruction }}</p>
      <p>{{ topic.story.assumptions }}</p>
      <p>{{ topic.story.boundaries }}</p>
      <p v-for="text in topic.story.deep" :key="text">{{ text }}</p>
    </details>
    <div class="topic-reading-layout">
    <nav class="topic-outline" aria-label="В этом разборе"><span>В этом разборе</span><button v-for="([id,label],i) in sections" :key="id" @click="jump(id!)"><span>{{String(i+1).padStart(2,'0')}}</span>{{label}}</button></nav>
    <div class="topic-sections">
      <section data-section="explanation">
        <h3 tabindex="-1">Как это работает</h3>
        <p>{{ topic.pilot.explanation.intro }}</p>
        <ol class="explanation-steps">
          <li v-for="step in topic.pilot.explanation.steps" :key="step.title">
            <h4>{{ step.title }}</h4>
            <p>{{ step.text }}</p>
          </li>
        </ol>
        <details v-if="topic.pilot.explanation.details">
          <summary>Особенности и альтернативы</summary>
          <p>{{ topic.pilot.explanation.details }}</p>
        </details>
      </section>
      <section data-section="study">
        <h3 tabindex="-1">Что нужно изучить</h3>
        <ul class="study-links">
          <li v-for="note in topic.pilot.study" :key="note.path">
            <RouterLink
              :to="link('themes', { note: canonicalNotePath(note.path) })"
              >{{ note.label }}</RouterLink
            >
            <p>{{ note.why }}</p>
          </li>
        </ul>
      </section>
      <section data-section="interview">
        <h3 tabindex="-1">Вопросы на собеседовании</h3>
        <p class="section-hint">
          Сначала ответьте вслух. Нажмите на вопрос, чтобы сравнить ответ.
        </p>
        <details
          v-for="q in topic.pilot.questions"
          :key="q.id"
          class="interview-question"
        >
          <summary>{{ q.question }}</summary>
          <div class="interview-answer">
            <h4>Короткий ответ</h4>
            <p>{{ q.short }}</p>
            <details>
              <summary>Подробный разбор</summary>
              <p v-for="text in q.detailed" :key="text">{{ text }}</p>
              <h4>Пример из проекта</h4>
              <p>{{ q.example }}</p>
            </details>
          </div>
        </details>
      </section>
      <section data-section="code">
        <h3 tabindex="-1">Реализация в коде</h3>
        <p>{{ topic.pilot.code.intro }}</p>
        <details
          v-if="
            [...topic.pilot.code.steps, ...topic.pilot.code.tests].some(
              (s) => s.project === 'cokr',
            )
          "
          class="local-settings"
        >
          <summary>Папка cokr на компьютере</summary>
          <label for="sourceRoot">Полный путь к папке проекта</label
          ><input
            id="sourceRoot"
            v-model="sourceRoot"
            placeholder="C:\…\cokr-3.9.3.15"
            autocomplete="off"
          />
          <p>
            Путь хранится только в этом браузере. Вставьте скопированный путь со
            строкой в быстрый переход вашего редактора.
          </p>
        </details>
        <template v-if="highlights"
          ><p>
            Ключевые точки сценария. Все шаги доступны ниже в исходном порядке.
          </p>
          <ol class="code-steps code-highlights">
            <CodeReference
              v-for="entry in highlights"
              :key="entry.index"
              :step="entry.step"
              :revision="topic.pilot.sourceRevision"
              :index="entry.index"
              @copy="copy"
            />
          </ol>
          <details class="further code-full">
            <summary>
              Полная последовательность ({{ topic.pilot.code.steps.length }})
            </summary>
            <ol class="code-steps">
              <CodeReference
                v-for="(step, index) in topic.pilot.code.steps"
                :key="index"
                :step="step"
                :index="index"
                :revision="topic.pilot.sourceRevision"
                @copy="copy"
              />
            </ol></details
        ></template>
        <ol v-else class="code-steps">
          <CodeReference
            v-for="(step, index) in topic.pilot.code.steps"
            :key="index"
            :step="step"
            :index="index"
            :revision="topic.pilot.sourceRevision"
            @copy="copy"
          />
        </ol>
        <details
          v-if="topic.pilot.code.tests.length"
          class="further code-tests"
        >
          <summary>
            Связанные тесты ({{ topic.pilot.code.tests.length }})
          </summary>
          <ol class="code-steps">
            <CodeReference
              v-for="(step, index) in topic.pilot.code.tests"
              :key="index"
              :step="step"
              :index="topic.pilot.code.steps.length + index"
              :revision="topic.pilot.sourceRevision"
              @copy="copy"
            />
          </ol>
        </details>
        <p v-if="topic.pilot.code.limitations" class="section-hint">
          {{ topic.pilot.code.limitations }}
        </p>
        <div v-if="fallback" id="copyFallback">
          <label for="sourceReference">Скопируйте ссылку на код</label
          ><textarea
            id="sourceReference"
            ref="textarea"
            :value="fallback"
            readonly
            rows="3"
          />
        </div>
      </section>
    </div>
    </div>
    <div v-if="related.length">
      <h3>Связанные узлы карты</h3>
      <RouterLink
        v-for="t in related"
        :key="t.id"
        class="platform-list-row"
        :to="link('projects', { projectTopic: t.id,project:t.project,mode:'topics',group:'Все',search:'' })"
        >{{ t.title }} ↗</RouterLink
      >
    </div>
    <div class="platform-actions">
      <button
        data-action="mark"
        data-status="again"
        :aria-pressed="progress.progress[topic.id]?.status === 'again'"
        @click="markTopic(topic.id, 'again')"
      >
        ↻ Нужно повторить</button
      ><button
        data-action="mark"
        data-status="done"
        :aria-pressed="progress.progress[topic.id]?.status === 'done'"
        @click="markTopic(topic.id, 'done')"
      >
        ✓ Могу объяснить
      </button>
    </div>
    <nav
      v-if="routeNodes && stepIndex >= 0"
      class="route-navigation"
      aria-label="Шаги маршрута"
    >
      <small>Шаг {{ stepIndex + 1 }}/{{ routeNodes.length }}</small>
      <div class="platform-actions">
        <RouterLink
          v-if="stepIndex > 0"
          class="platform-button"
          :to="stepLink(routeNodes[stepIndex - 1]!)"
          >← Предыдущий шаг</RouterLink
        ><RouterLink
          v-if="stepIndex < routeNodes.length - 1"
          class="platform-button"
          :to="stepLink(routeNodes[stepIndex + 1]!)"
          >Следующий шаг →</RouterLink
        ><span v-else>Последний шаг маршрута</span>
      </div>
    </nav>
  </article>
</template>
