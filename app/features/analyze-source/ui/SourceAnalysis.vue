<script setup lang="ts">
import { useSourceAnalysis } from "#ui/features/analyze-source/model/useSourceAnalysis.ts";
import MarkdownContent from "#ui/entities/material/ui/MarkdownContent.vue";
const state = useSourceAnalysis();
const {
  scenario,
  sourceKind,
  paths,
  context,
  files,
  skippedFiles,
  current,
  selected,
  busy,
  error,
  running,
  canStart,
  connections,
  pending,
} = state;
const status = {
  running: "Идёт анализ",
  ready: "Готово к просмотру",
  accepted: "Добавлено",
  failed: "Анализ не завершён",
  cancelled: "Остановлено",
  unchanged: "Изменений нет",
};
const actionLabel = {
  add: "Новая тема",
  update: "Дополнение",
  skip: "Уже есть в базе",
  conflict: "Нужно выбрать версию",
};
</script>
<template>
  <div class="source-analysis">
    <header class="analysis-heading">
      <h1>Свои материалы</h1>
      <RouterLink :to="{ path: '/sources', query: { mode: 'manual' } }"
        >Импорт готовых материалов</RouterLink
      >
    </header>
    <p v-if="error" role="alert" class="analysis-error">{{ error }}</p>
    <form v-if="!current" class="analysis-form" @submit.prevent="state.start">
      <fieldset class="analysis-scenarios">
        <legend class="platform-search-label">Что подготовить</legend>
        <label :class="{ selected: scenario === 'project' }"
          ><input
            v-model="scenario"
            type="radio"
            value="project"
            :disabled="busy"
          /><strong>Разобрать проекты</strong></label
        >
        <label :class="{ selected: scenario === 'import' }"
          ><input
            v-model="scenario"
            type="radio"
            value="import"
            :disabled="busy"
          /><strong>Дополнить базу знаний</strong></label
        >
      </fieldset>
      <fieldset class="analysis-source-kind">
        <legend class="platform-search-label">Где находятся материалы</legend>
        <label
          ><input
            v-model="sourceKind"
            type="radio"
            value="path"
            :disabled="busy"
          />Путь к папке</label
        >
        <label
          ><input
            v-model="sourceKind"
            type="radio"
            value="files"
            :disabled="busy"
          />Загрузить файлы</label
        >
      </fieldset>
      <div v-if="sourceKind === 'path'" class="analysis-field">
        <label for="analysisPaths">{{
          scenario === "project"
            ? "Папки проектов — по одной в строке"
            : "Папки с материалами — по одной в строке"
        }}</label>
        <textarea
          id="analysisPaths"
          v-model="paths"
          rows="3"
          :disabled="busy"
          placeholder="C:\Projects\my-app"
          spellcheck="false"
        />
      </div>
      <div v-else class="analysis-upload">
        <div class="analysis-field">
          <label for="analysisFiles">Файлы или ZIP-архив</label
          ><input
            id="analysisFiles"
            type="file"
            multiple
            :disabled="busy"
            @change="state.selectFiles"
          />
        </div>
        <div class="analysis-field">
          <label for="analysisFolder">Папка с компьютера</label
          ><input
            id="analysisFolder"
            type="file"
            webkitdirectory
            multiple
            :disabled="busy"
            @change="state.selectFiles"
          />
        </div>
        <p v-if="files.length" role="status">
          Файлов для анализа: {{ files.length - skippedFiles.length }}
        </p>
        <details v-if="skippedFiles.length" class="analysis-warnings">
          <summary>Исключено из загрузки: {{ skippedFiles.length }}</summary>
          <ul>
            <li
              v-for="file in skippedFiles.slice(0, 20)"
              :key="file.webkitRelativePath || file.name"
            >
              {{ file.webkitRelativePath || file.name }}
            </li>
          </ul>
          <p v-if="skippedFiles.length > 20">
            И ещё {{ skippedFiles.length - 20 }} файлов.
          </p>
        </details>
      </div>
      <div class="analysis-field">
        <label for="analysisContext">{{
          scenario === "project"
            ? "Описание проекта и ваша работа — необязательно"
            : "Пожелания — необязательно"
        }}</label>
        <textarea
          id="analysisContext"
          v-model="context"
          rows="3"
          maxlength="20000"
          :disabled="busy"
        />
      </div>
      <button class="primary" :disabled="!canStart" type="submit">
        {{ busy ? "Подключаем материалы…" : "Начать анализ" }}
      </button>
    </form>
    <section v-else class="analysis-result" aria-label="Результат анализа">
      <div class="analysis-result-heading">
        <h2>
          {{
            current.name ||
            (current.scenario === "project"
              ? "Разбор проекта"
              : "Дополнение базы знаний")
          }}
        </h2>
        <button :disabled="busy" @click="state.newSource">
          Новое подключение
        </button>
      </div>
      <div class="analysis-status" role="status">
        <strong>{{ status[current.status] }}</strong
        ><span v-if="current.filesCount">{{ current.filesCount }} файлов</span>
      </div>
      <template v-if="running">
        <p>{{ current.stage }}</p>
        <progress
          :value="current.completed"
          :max="Math.max(1, current.total)"
          :aria-label="current.stage || 'Ход анализа'"
        />
        <button :disabled="busy" @click="state.cancel">
          Остановить анализ
        </button>
      </template>
      <p v-if="current.error" role="alert">{{ current.error }}</p>
      <MarkdownContent v-if="current.summary" :text="current.summary" />
      <details v-if="current.warnings.length" class="analysis-warnings">
        <summary>Не удалось обработать: {{ current.warnings.length }}</summary>
        <ul>
          <li v-for="warning in current.warnings" :key="warning">
            {{ warning }}
          </li>
        </ul>
      </details>
      <template v-if="current.projectDraft">
        <MarkdownContent
          v-if="current.projectDraft.summary !== current.summary"
          :text="current.projectDraft.summary"
        />
        <div class="analysis-project-topics">
          <details
            v-for="(topic, index) in current.projectDraft.topics"
            :key="index"
          >
            <summary>{{ topic.title }}</summary>
            <MarkdownContent :text="topic.explanation" />
            <ol>
              <li v-for="step in topic.mechanism" :key="step">{{ step }}</li>
            </ol>
            <MarkdownContent :text="topic.tradeoff" />
            <details
              v-for="question in topic.questions"
              :key="question.question"
              class="analysis-question"
            >
              <summary>{{ question.question }}</summary>
              <MarkdownContent :text="question.answer" />
            </details>
          </details>
        </div>
      </template>
      <div
        v-if="current.changes.length"
        class="analysis-changes"
        aria-label="Изменения базы знаний"
      >
        <article
          v-for="change in current.changes"
          :key="change.id"
          class="analysis-change"
        >
          <div class="analysis-change-title">
            <label
              ><input
                v-if="current.status === 'ready'"
                v-model="selected"
                type="checkbox"
                :value="change.id"
                :disabled="busy || change.action === 'skip'"
              /><strong>{{ change.title }}</strong></label
            ><span>{{ actionLabel[change.action] }}</span>
          </div>
          <p v-if="change.reason">{{ change.reason }}</p>
          <details v-if="change.before">
            <summary>Сейчас в базе</summary>
            <MarkdownContent :text="change.before" />
          </details>
          <details v-if="change.after" :open="change.action === 'conflict'">
            <summary>
              {{ change.before ? "После изменения" : "Новый материал" }}
            </summary>
            <MarkdownContent :text="change.after" />
          </details>
        </article>
      </div>
      <div class="analysis-actions">
        <button
          v-if="current.status === 'ready'"
          class="primary"
          :disabled="
            busy ||
            (current.scenario === 'import' &&
              current.changes.some((change) => change.action !== 'skip') &&
              !selected.length)
          "
          @click="state.accept"
        >
          {{
            current.scenario === "project"
              ? "Добавить разбор проекта"
              : current.changes.every((change) => change.action === "skip")
                ? "Завершить проверку"
                : `Принять выбранные изменения (${selected.length})`
          }}
        </button>
        <RouterLink
          v-if="
            ['accepted', 'unchanged'].includes(current.status) &&
            current.projectId
          "
          class="platform-button primary"
          :to="{ path: '/projects', query: { project: current.projectId } }"
          >Открыть проект</RouterLink
        >
        <RouterLink
          v-else-if="current.status === 'accepted'"
          class="platform-button primary"
          to="/themes"
          >Открыть базу знаний</RouterLink
        >
        <button
          v-if="['failed', 'cancelled'].includes(current.status)"
          :disabled="busy"
          @click="state.update(current)"
        >
          Повторить анализ
        </button>
        <button
          v-if="current.status === 'running' || error"
          :disabled="busy"
          @click="state.refresh"
        >
          Обновить состояние
        </button>
      </div>
    </section>
    <section v-if="connections.length" class="analysis-connections">
      <h2>Подключённые папки и материалы</h2>
      <article
        v-for="job in connections"
        :key="job.connectionId"
        class="analysis-connection"
      >
        <div>
          <h3>{{ job.name }}</h3>
          <ul v-if="job.roots.length" class="analysis-paths">
            <li v-for="root in job.roots" :key="root">{{ root }}</li>
          </ul>
          <span class="platform-muted"
            >{{ job.scenario === "project" ? "Проект" : "База знаний" }} ·
            {{ job.filesCount }} файлов</span
          >
        </div>
        <div class="analysis-actions">
          <button :disabled="busy" @click="state.open(job.id)">
            Открыть результат</button
          ><button
            v-if="job.roots.length"
            :disabled="busy || running"
            @click="state.update(job)"
          >
            Проверить обновления
          </button>
        </div>
      </article>
    </section>
    <section v-if="pending.length" class="analysis-history">
      <h2>Последние задания</h2>
      <ul>
        <li v-for="job in pending" :key="job.id">
          <button :disabled="busy" @click="state.open(job.id)">
            {{
              job.name ||
              (job.scenario === "project"
                ? "Разбор проекта"
                : "Дополнение базы знаний")
            }}</button
          ><span>{{ status[job.status] }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
<style scoped>
.analysis-heading,
.analysis-result-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin-bottom: 28px;
}
.analysis-heading h1,
.analysis-result-heading h2 {
  margin: 0;
}
.analysis-heading a {
  font-size: 14px;
}
.analysis-form {
  max-width: 850px;
}
.analysis-scenarios {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0;
  border: 0;
  margin: 0 0 28px;
  gap: 16px;
}
.analysis-scenarios label {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.analysis-scenarios label.selected {
  border-color: var(--accent);
  background: #edf3ff;
  box-shadow: inset 0 0 0 1px var(--accent);
}
.analysis-scenarios input,
.analysis-source-kind input,
.analysis-change input {
  accent-color: var(--accent);
  flex-shrink: 0;
}
.analysis-source-kind {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 0;
  border: 0;
  margin: 0 0 20px;
}
.analysis-source-kind label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.analysis-field {
  display: grid;
  gap: 8px;
  margin-bottom: 24px;
}
.analysis-field label {
  font-weight: 600;
  font-size: 14px;
}
.analysis-field textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  resize: vertical;
  color: var(--ink);
  background: var(--surface);
}
.analysis-field input {
  max-width: 100%;
}
.analysis-status {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  color: var(--muted);
  margin-bottom: 16px;
}
.analysis-result progress {
  display: block;
  width: min(100%, 620px);
  height: 12px;
  margin: 16px 0 24px;
  accent-color: var(--accent);
}
.analysis-result,
.analysis-connections,
.analysis-history {
  margin-top: 32px;
}
.analysis-result,
.analysis-change,
.analysis-connection {
  min-width: 0;
}
.analysis-project-topics > details,
.analysis-change,
.analysis-connection,
.analysis-history li {
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}
.analysis-project-topics summary {
  cursor: pointer;
  font-weight: 600;
}
.analysis-project-topics .analysis-question {
  margin-block: 16px;
}
.analysis-change-title {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px 20px;
}
.analysis-change-title label {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.analysis-change-title > span {
  font-size: 13px;
  color: var(--muted);
}
.analysis-change details {
  margin-block: 12px;
}
.analysis-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}
.analysis-connection {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px 24px;
}
.analysis-connection > div {
  min-width: 0;
}
.analysis-connection h3 {
  margin: 0 0 8px;
}
.analysis-paths {
  padding: 0;
  margin: 0 0 8px;
  list-style: none;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.analysis-history ul {
  padding: 0;
  list-style: none;
}
.analysis-history li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.analysis-history li span {
  font-size: 14px;
  color: var(--muted);
}
.analysis-warnings {
  margin-block: 16px;
}
.analysis-error {
  color: #a92b2b;
}
@media (max-width: 640px) {
  .analysis-scenarios {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .analysis-scenarios label {
    padding: 18px;
  }
  .analysis-heading {
    align-items: flex-start;
  }
}
</style>
