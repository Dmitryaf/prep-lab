<script setup lang="ts">
import { usePromptEditor } from "#ui/features/edit-prompt/model/usePromptEditor.ts";
import LoadingState from "#ui/shared/ui/LoadingState.vue";
const state = usePromptEditor();
const {
  prompts,
  selectedId,
  selected,
  text,
  busy,
  loading,
  loaded,
  loadError,
  error,
  message,
  dirty,
  request,
  context,
  availableMaterials,
  selectedMaterials,
  transmitted,
  composed,
} = state;
</script>
<template>
  <div class="prompt-editor">
    <h1>Промпты</h1>
    <LoadingState
      v-if="loading"
      :compact="loaded"
      :label="loaded ? 'Обновляем промпты…' : 'Загружаем промпты…'"
    />
    <div v-if="loadError">
      <p role="alert">{{ loadError }}</p>
      <button
        v-if="!selected"
        type="button"
        :disabled="busy"
        @click="state.reload"
      >
        Повторить загрузку промптов
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="loaded && !loading && !prompts.length">Промптов пока нет.</p>
    <div
      v-if="prompts.length"
      class="prompt-tabs"
      role="group"
      aria-label="Шаблоны заданий"
    >
      <button
        v-for="item in prompts"
        :key="item.template.id"
        :aria-pressed="selectedId === item.template.id"
        :disabled="busy || (dirty && selectedId !== item.template.id)"
        @click="state.select(item.template.id)"
      >
        {{ item.template.title }}
      </button>
    </div>
    <section v-if="selected" :aria-busy="busy">
      <h2>{{ selected.template.title }}</h2>
      <p>{{ selected.template.purpose }}</p>
      <p>
        Встроенная версия {{ selected.template.version }} ·
        {{
          selected.customized
            ? "Сохранён личный вариант"
            : "Используется встроенный текст"
        }}
      </p>
      <p v-if="selected.needsReview" role="status">
        Встроенный шаблон обновился. Личная редакция сохранена; сравните её с
        новой версией перед изменением.
      </p>
      <label for="personalPrompt">Текст промпта</label>
      <textarea
        id="personalPrompt"
        v-model="text"
        rows="18"
        maxlength="20000"
        :disabled="busy"
      />
      <p v-if="dirty">Есть несохранённые изменения.</p>
      <div class="prompt-actions">
        <button
          :disabled="busy || !dirty || !text.trim()"
          @click="state.save()"
        >
          Сохранить промпт
        </button>
        <button :disabled="busy || !dirty" @click="state.discard">
          Отменить правки
        </button>
        <button
          :disabled="busy || (!selected.customized && !dirty)"
          @click="state.save(true)"
        >
          Вернуть встроенный текст
        </button>
        <button :disabled="busy || dirty" @click="state.reload">
          Обновить версии
        </button>
      </div>
      <details :open="selected.needsReview">
        <summary>Сравнить встроенные версии</summary>
        <div class="prompt-comparison">
          <section>
            <h3>Встроенный текст при сохранении личного варианта</h3>
            <pre>{{ selected.previousBase }}</pre>
          </section>
          <section>
            <h3>Текущий встроенный текст</h3>
            <pre>{{ selected.template.text }}</pre>
          </section>
        </div>
      </details>
      <section>
        <h2>Просмотр итогового задания</h2>
        <label for="promptRequest">Вопрос или задача</label
        ><textarea
          id="promptRequest"
          v-model="request"
          rows="3"
          maxlength="10000"
          :disabled="busy"
        />
        <label for="promptContext">Дополнительный контекст</label
        ><textarea
          id="promptContext"
          v-model="context"
          rows="4"
          maxlength="20000"
          :disabled="busy"
        />
        <label for="promptMaterials">Материалы для задания</label>
        <select
          id="promptMaterials"
          v-model="selectedMaterials"
          multiple
          size="6"
          :disabled="busy"
        >
          <option
            v-for="note in availableMaterials"
            :key="note.id"
            :value="note.id"
          >
            {{ note.title }} · {{ note.path }}
          </option>
        </select>
        <details v-if="transmitted.length">
          <summary>Передаваемые материалы: {{ transmitted.length }}</summary>
          <section v-for="note in transmitted" :key="note.id">
            <h3>{{ note.path }}</h3>
            <pre>{{ note.text }}</pre>
          </section>
        </details>
        <button
          :disabled="busy || !request.trim() || !text.trim()"
          @click="state.preview"
        >
          Показать итоговое задание
        </button>
        <section v-if="composed" aria-label="Итоговое задание">
          <h3>Итоговое задание</h3>
          <pre>{{ composed }}</pre>
        </section>
      </section>
    </section>
  </div>
</template>
<style scoped>
.prompt-editor,
.prompt-editor section {
  min-width: 0;
}
.prompt-editor section {
  margin-block: 1.25rem;
}
.prompt-tabs,
.prompt-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-block: 1rem;
}
.prompt-tabs [aria-pressed="true"] {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
.prompt-editor label {
  display: block;
  margin-block: 0.75rem 0.25rem;
}
.prompt-editor textarea,
.prompt-editor select {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.prompt-editor textarea {
  font: 0.9rem/1.5 monospace;
}
.prompt-editor pre {
  max-height: 30rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.prompt-editor button,
.prompt-editor h3 {
  overflow-wrap: anywhere;
}
.prompt-comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
@media (max-width: 700px) {
  .prompt-comparison {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
