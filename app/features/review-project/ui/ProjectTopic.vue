<script setup lang="ts">
import { storeToRefs } from "pinia";

import { computed, ref, nextTick } from "vue";
import type { Topic, CodeStep } from "#domain/projects/types.ts";
import { useProjectCatalog } from "#ui/entities/project/model/catalog.ts";
const { topics, catalog } = storeToRefs(useProjectCatalog());
import { useRoute } from "vue-router";
import { usePreparation } from "#ui/entities/preparation/model/store.ts";
import { useSettings } from "#ui/entities/preparation/model/settings.ts";
const { progress } = storeToRefs(usePreparation());
import { useProjectReview } from "#ui/features/review-project/model/store.ts";
const { markTopic } = useProjectReview();
import { useNotices } from "#ui/shared/model/notices.ts";
const { notify } = useNotices();

import { link } from "#ui/shared/lib/navigation.ts";
import { canonicalNotePath } from "#domain/knowledge/path.ts";
import { cleanEditorialNotes } from "#domain/knowledge/editorial-notes.ts";
import {
  localCodeReference,
  highlightedCode,
} from "#domain/projects/sources.ts";
import CodeReference from "#ui/entities/project/ui/CodeReference.vue";
import { StudyDiscussion as StudyChat } from "#ui/features/study-discussion/index.ts";
const props = defineProps<{ topic: Topic; routeNodes?: string[] }>();
const route = useRoute();
const stepLink = (id: string) => ({
  path: "/projects",
  query: { ...route.query, projectTopic: id },
});
const sourceRoot = ref(""),
  fallback = ref(""),
  textarea = ref<HTMLTextAreaElement>();
const instanceSettings = useSettings();
void instanceSettings.initialize().then(() => {
  sourceRoot.value = instanceSettings.settings.sourceRoot;
});
const highlights = computed(
  () =>
    highlightedCode(props.topic.pilot, catalog.value.codeHighlights) as
      { step: CodeStep; index: number }[] | null,
);
const related = computed(() =>
  topics.value.filter((t) => props.topic.related.includes(t.id)),
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
function jump(section: string) {
  const heading = document.querySelector<HTMLElement>(
    `#details [data-section="${section}"] h3`,
  );
  heading?.focus({ preventScroll: true });
  heading?.scrollIntoView({ block: "start", behavior: "instant" });
}
const hasCode = computed(() =>
  Boolean(
    props.topic.pilot.code.steps.length || props.topic.pilot.code.tests.length,
  ),
);
const storyParagraphs = computed(() => {
  const story = props.topic.story;
  if (!story) return [];
  return [
    ...new Set(
      [story.short, story.confirmed, ...story.deep].map(cleanEditorialNotes),
    ),
  ].filter((text) => text.trim() && text.trim() !== props.topic.summary.trim());
});
const sections = computed(() => [
  ["explanation", "Как это работает"],
  ...(props.topic.pilot.study.length ? [["study", "Что нужно изучить"]] : []),
  ["interview", "Вопросы на собеседовании"],
  ...(hasCode.value ? [["code", "Реализация в коде"]] : []),
]);
</script>
<template>
  <article id="details" class="platform-card project-detail">
    <header class="topic-intro">
      <h1 class="topic-title" tabindex="-1">{{ topic.title }}</h1>
      <p>{{ topic.summary }}</p>
      <p class="platform-meta">
        {{ topic.priority }} ·
        {{
          progress.progress[topic.id]?.status === "done"
            ? "✓ Могу объяснить"
            : progress.progress[topic.id]?.status === "again"
              ? "↻ Повторить"
              : "Не проверено"
        }}
      </p>
      <StudyChat
        :key="topic.id"
        :material-key="'topic:' + topic.id"
        :title="topic.title"
        :context="JSON.stringify(topic, null, 2)"
      />
    </header>
    <details v-if="storyParagraphs.length">
      <summary>Моя работа в проекте</summary>
      <p v-for="text in storyParagraphs" :key="text">{{ text }}</p>
    </details>
    <div class="topic-reading-layout">
      <nav class="topic-outline" aria-label="В этом разборе">
        <span>В этом разборе</span
        ><button
          v-for="([id, label], i) in sections"
          :key="id"
          @click="jump(id!)"
        >
          <span>{{ String(i + 1).padStart(2, "0") }}</span
          >{{ label }}
        </button>
      </nav>
      <div class="topic-sections">
        <section data-section="explanation">
          <h3 tabindex="-1">Как это работает</h3>
          <p
            v-if="topic.pilot.explanation.intro.trim() !== topic.summary.trim()"
          >
            {{ topic.pilot.explanation.intro }}
          </p>
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
        <section v-if="topic.pilot.study.length" data-section="study">
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
          <details
            v-for="q in topic.pilot.questions"
            :key="q.id"
            class="interview-question"
          >
            <summary>{{ q.question }}</summary>
            <div class="interview-answer">
              <h4>Короткий ответ</h4>
              <p>{{ q.short }}</p>
              <details v-if="q.detailed.length || q.example">
                <summary>Подробный разбор</summary>
                <p v-for="text in q.detailed" :key="text">{{ text }}</p>
                <h4 v-if="q.example">Пример из проекта</h4>
                <p v-if="q.example">{{ q.example }}</p>
              </details>
            </div>
          </details>
        </section>
        <section v-if="hasCode" data-section="code">
          <h3 tabindex="-1">Реализация в коде</h3>
          <p>{{ topic.pilot.code.intro }}</p>
          <details
            v-if="
              [...topic.pilot.code.steps, ...topic.pilot.code.tests].some(
                (s) => !catalog.repositories[s.project],
              )
            "
            class="local-settings"
          >
            <summary>Папка исходников в вашем редакторе</summary>
            <label for="sourceRoot">Полный путь к папке проекта</label
            ><input
              id="sourceRoot"
              v-model="sourceRoot"
              :disabled="!instanceSettings.ready || instanceSettings.saving"
              placeholder="C:\…\project"
              autocomplete="off"
              @change="instanceSettings.save({ sourceRoot })"
            />
            <p>
              Путь сохраняется в вашем экземпляре. Вставьте скопированный путь
              со строкой в быстрый переход вашего редактора.
            </p>
          </details>
          <template v-if="highlights"
            ><p>
              Ключевые точки сценария. Все шаги доступны ниже в исходном
              порядке.
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
      <h3>Связанные темы</h3>
      <RouterLink
        v-for="t in related"
        :key="t.id"
        class="platform-list-row"
        :to="
          link('projects', {
            projectTopic: t.id,
            project: t.project,
            mode: 'topics',
            group: 'Все',
            search: '',
          })
        "
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
