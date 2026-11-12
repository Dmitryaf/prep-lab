<script setup lang="ts">
import { useSources } from "#ui/features/connect-source/model/useSources.ts";
import LoadingState from "#ui/shared/ui/LoadingState.vue";
import SourcePreview from "./SourcePreview.vue";
const state = useSources();
const {
  catalog,
  preview,
  busy,
  loading,
  catalogLoaded,
  loadError,
  error,
  message,
  name,
  sourceId,
  kind,
  rootId,
  includeInterviews,
  files,
  resolutions,
  headingMatches,
  edit,
  report,
  canAccept,
} = state;
function selectFiles(event: Event) {
  files.value = [...((event.target as HTMLInputElement).files || [])];
}
</script>
<template>
  <div class="source-manager">
    <h1>Свои материалы</h1>
    <RouterLink :to="{ path: '/generate', query: { scenario: 'import' } }"
      >Подготовить материалы с помощником</RouterLink
    >
    <LoadingState v-if="loading" label="Загружаем источники…" />
    <div v-if="loadError">
      <p role="alert">{{ loadError }}</p>
      <button type="button" :disabled="busy" @click="state.load">
        Повторить загрузку источников
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="!preview && catalogLoaded">
      <section v-if="edit">
        <h2>Редактирование материала</h2>
        <label for="sourceEdit">Текст материала</label
        ><textarea
          id="sourceEdit"
          v-model="edit.markdown"
          rows="18"
          :disabled="busy"
        />
        <div class="source-actions">
          <button :disabled="busy" @click="state.saveEdit">
            Просмотреть правку</button
          ><button :disabled="busy" @click="edit = null">Отмена</button>
        </div>
      </section>
      <form v-else @submit.prevent="state.prepare">
        <h2>
          {{ sourceId ? "Обновление источника" : "Добавление источника" }}
        </h2>
        <label for="sourceName">Название источника</label
        ><input
          id="sourceName"
          v-model="name"
          required
          maxlength="160"
          :disabled="busy"
        />
        <label for="sourceKind">Откуда загрузить</label
        ><select id="sourceKind" v-model="kind" :disabled="busy">
          <option value="upload">Файлы с моего компьютера</option>
          <option value="folder">Разрешённая папка сервера</option>
        </select>
        <template v-if="kind === 'upload'"
          ><label for="sourceUpload">Markdown или ZIP</label
          ><input
            id="sourceUpload"
            :key="sourceId"
            type="file"
            accept=".md,.zip"
            multiple
            :disabled="busy"
            @change="selectFiles"
          />
          <p>
            До 200 Markdown-файлов или один ZIP, всего до 8 МБ. При обновлении
            загрузите полный снимок источника.
          </p></template
        >
        <template v-else
          ><label for="sourceRoot">Папка сервера</label
          ><select id="sourceRoot" v-model="rootId" :disabled="busy">
            <option value="">Выберите папку</option>
            <option
              v-for="root in catalog.roots"
              :key="root.id"
              :value="root.id"
            >
              {{ root.name }}
            </option>
          </select>
          <p v-if="!catalog.roots.length">
            Владелец сервера ещё не разрешил папки для чтения. Можно загрузить
            файлы с компьютера.
          </p></template
        >
        <label class="source-checkbox"
          ><input
            v-model="includeInterviews"
            type="checkbox"
            :disabled="busy"
          />Включать вопросы источника в интервью и практику</label
        >
        <div class="source-actions">
          <button
            type="submit"
            :disabled="
              busy ||
              !name.trim() ||
              (kind === 'upload' ? !files.length : !rootId)
            "
          >
            Подготовить изменения</button
          ><button
            v-if="sourceId"
            type="button"
            :disabled="busy"
            @click="
              sourceId = '';
              name = '';
              files = [];
            "
          >
            Новый источник
          </button>
        </div>
      </form>
      <section v-if="catalog.pending.length">
        <h2>Непринятые изменения</h2>
        <button
          v-for="pending in catalog.pending"
          :key="pending.id"
          :disabled="busy"
          @click="state.open(pending.id)"
        >
          Продолжить просмотр: {{ pending.name }}
        </button>
      </section>
      <section>
        <h2>Подключённые источники</h2>
        <p v-if="!catalog.sources.length">
          Добавьте свои заметки: после просмотра они появятся в материалах и
          подготовке.
        </p>
        <article v-for="source in catalog.sources" :key="source.id">
          <h3>{{ source.name }}</h3>
          <p>
            Версия {{ source.revision }} ·
            {{
              source.documents.filter((item) => item.markdown !== null).length
            }}
            материалов
          </p>
          <button :disabled="busy" @click="state.update(source.id)">
            Обновить {{ source.name }}
          </button>
          <details>
            <summary>Материалы источника</summary>
            <div
              v-for="document in source.documents.filter(
                (item) => item.markdown !== null,
              )"
              :key="document.id"
              class="source-document"
            >
              <RouterLink
                :to="{ path: '/themes', query: { note: document.id } }"
                >{{ document.path }}</RouterLink
              ><button
                :disabled="busy"
                @click="
                  edit = {
                    sourceId: source.id,
                    documentId: document.id,
                    markdown: document.markdown!,
                  }
                "
              >
                Редактировать {{ document.path }}
              </button>
            </div>
          </details>
        </article>
      </section>
    </template>
    <template v-else-if="preview">
      <SourcePreview
        v-model:resolutions="resolutions"
        v-model:heading-matches="headingMatches"
        :preview="preview"
        :busy="busy"
        @rematch="state.rematch"
      />
      <div class="source-actions">
        <button :disabled="busy" @click="state.saveReview">
          Сохранить правки просмотра
        </button>
        <button :disabled="!canAccept" @click="state.inspect">
          Проверить результат</button
        ><button :disabled="!canAccept" @click="state.accept">
          Принять изменения</button
        ><button :disabled="busy" @click="state.discard">Отклонить</button
        ><button :disabled="busy" @click="preview = null">
          Вернуться к источникам
        </button>
      </div>
      <section v-if="report" aria-label="Результат проверки">
        <p>{{ report.notes }} материалов, {{ report.questions }} вопросов</p>
        <p v-for="warning in report.warnings" :key="warning">{{ warning }}</p>
        <p v-for="issue in report.errors" :key="issue" role="alert">
          {{ issue }}
        </p>
        <p v-if="!report.errors.length">Ссылки и структура проверены.</p>
      </section>
    </template>
  </div>
</template>
<style>
.source-manager {
  max-width: 100%;
  min-width: 0;
}
.source-manager section,
.source-manager article,
.source-manager form {
  margin-block: 1.25rem;
  min-width: 0;
}
.source-manager label {
  display: block;
  margin-block: 0.75rem 0.25rem;
}
.source-manager input:not([type="checkbox"]),
.source-manager select,
.source-manager textarea {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.source-manager textarea {
  font: 0.9rem/1.5 monospace;
}
.source-manager pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 24rem;
  overflow: auto;
  padding: 0.75rem;
}
.source-manager button,
.source-manager a,
.source-manager h3 {
  overflow-wrap: anywhere;
}
.source-actions,
.source-document {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  margin-block: 0.8rem;
}
.source-review-grid {
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) minmax(0, 3fr);
  gap: 1rem;
}
.source-files {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 30rem;
  overflow: auto;
}
.source-files button {
  text-align: left;
}
.source-files span {
  display: block;
  font-size: 0.8em;
  opacity: 0.75;
}
.source-files [aria-pressed="true"] {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
.source-change {
  min-width: 0;
}
.source-change details {
  margin-block: 0.75rem;
}
.source-checkbox {
  display: flex !important;
  gap: 0.5rem;
  align-items: center;
}
@media (max-width: 700px) {
  .source-review-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .source-files {
    max-height: 12rem;
  }
}
</style>
