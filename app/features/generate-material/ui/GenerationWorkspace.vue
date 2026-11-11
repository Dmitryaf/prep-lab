<script setup lang="ts">
import { useGeneration } from "#ui/features/generate-material/model/useGeneration.ts";
import ImportDraftEditor from "./ImportDraftEditor.vue";
import ProjectDraftEditor from "./ProjectDraftEditor.vue";
const state = useGeneration();
const {
  scenario,
  request,
  context,
  selectedMaterials,
  uploads,
  availableMaterials,
  transmitted,
  validInput,
  history,
  current,
  draft,
  importDraft,
  projectDraft,
  validDraft,
  prompt,
  partial,
  error,
  message,
  busy,
  streaming,
  activeId,
} = state;
const status = {
  pending: "Подготавливается",
  completed: "Готов к просмотру",
  failed: "Не удалось подготовить",
  interrupted: "Прервано",
  accepted: "Принято",
};
</script>
<template>
  <div class="generation-workspace">
    <h1>Подготовить материалы</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <section v-if="!current && !streaming">
      <label for="generationScenario">Сценарий</label
      ><select id="generationScenario" v-model="scenario" :disabled="busy">
        <option value="import">Подготовка базы по материалам</option>
        <option value="project">Разбор проекта и опыта</option>
      </select>
      <label for="generationRequest">Задача</label
      ><textarea
        id="generationRequest"
        v-model="request"
        rows="3"
        maxlength="10000"
        :disabled="busy"
      />
      <label for="generationContext">{{
        scenario === "project"
          ? "Рассказ о проекте и роли"
          : "Контекст и пожелания"
      }}</label
      ><textarea
        id="generationContext"
        v-model="context"
        rows="5"
        maxlength="20000"
        :disabled="busy"
      />
      <label for="generationMaterials">Материалы из базы</label
      ><select
        id="generationMaterials"
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
      <label for="generationFiles">Текстовые фрагменты с компьютера</label
      ><input
        id="generationFiles"
        type="file"
        multiple
        accept=".md,.mdx,.txt,.ts,.tsx,.js,.jsx,.mjs,.cjs,.vue,.svelte,.css,.json,.html,.sql,.py,.go,.java,.kt,.cs,.rs,.rb,.php,.yaml,.yml,.graphql,.gql"
        :disabled="busy"
        @change="state.addFiles"
      />
      <ul v-if="uploads.length">
        <li v-for="(file, index) in uploads" :key="file.id">
          {{ file.path }}
          <button :disabled="busy" @click="uploads.splice(index, 1)">
            Убрать {{ file.path }}
          </button>
        </li>
      </ul>
      <details v-if="transmitted.length">
        <summary>Передаваемые материалы: {{ transmitted.length }}</summary>
        <section v-for="material in transmitted" :key="material.id">
          <h3>{{ material.path }}</h3>
          <pre>{{ material.text }}</pre>
        </section>
      </details>
      <p v-if="request && !validInput" role="alert">
        Проверьте объём контекста: до 30 материалов, до 100 тысяч символов на
        фрагмент и до 250 тысяч символов всего.
      </p>
      <div class="generation-actions">
        <button :disabled="busy || !validInput" @click="state.preview">
          Показать задание перед отправкой</button
        ><button
          :disabled="busy || !prompt || !validInput"
          @click="state.generate"
        >
          Подготовить черновик
        </button>
      </div>
      <section v-if="prompt" aria-label="Задание">
        <h2>Задание</h2>
        <pre>{{ prompt }}</pre>
      </section>
    </section>
    <section v-if="streaming" aria-live="polite">
      <h2>Подготовка черновика</h2>
      <button :disabled="!activeId" @click="state.cancel">
        Отменить подготовку
      </button>
      <pre>{{ partial || "Ожидание ответа…" }}</pre>
    </section>
    <section v-if="current">
      <p class="generation-current-status">{{ status[current.status] }}</p>
      <p>Задача: {{ current.input.request }}</p>
      <p v-if="current.error" role="alert">{{ current.error }}</p>
      <details>
        <summary>Задание и переданный контекст</summary>
        <pre>{{ current.prompt }}</pre>
      </details>
      <details
        :open="current.status === 'failed' || current.status === 'interrupted'"
      >
        <summary>Сохранённый ответ</summary>
        <pre>{{ current.raw || "Текст ответа не получен." }}</pre>
      </details>
      <template v-if="draft"
        ><h2>Просмотр черновика</h2>
        <ImportDraftEditor
          v-if="current.scenario === 'import'"
          v-model="importDraft"
          :disabled="busy || current.status !== 'completed'"
        />
        <ProjectDraftEditor
          v-else
          v-model="projectDraft"
          :materials="current.input.materials"
          :disabled="busy || current.status !== 'completed'"
        />
        <p v-if="current.status === 'completed' && !validDraft" role="alert">
          Проверьте заполнение обязательных полей черновика.
        </p>
        <button :disabled="busy || !validDraft" @click="state.accept">
          Принять черновик
        </button>
      </template>
      <div class="generation-actions">
        <button :disabled="busy" @click="state.refresh">
          Обновить результат</button
        ><button :disabled="busy" @click="state.newDraft">Новое задание</button>
      </div>
    </section>
    <section v-if="history.length">
      <h2>История заданий</h2>
      <article v-for="job in history" :key="job.id">
        <p>{{ status[job.status] }}</p>
        <button :disabled="busy || streaming" @click="state.open(job.id)">
          Открыть задание: {{ job.request }}
        </button>
      </article>
    </section>
  </div>
</template>
<style>
.generation-workspace,
.generation-workspace section,
.generation-workspace article {
  min-width: 0;
}
.generation-workspace section,
.generation-workspace article {
  margin-block: 1.25rem;
}
.generation-workspace label {
  display: block;
  margin-block: 0.75rem 0.25rem;
}
.generation-workspace input,
.generation-workspace select,
.generation-workspace textarea {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.generation-workspace textarea {
  font: 0.9rem/1.5 monospace;
}
.generation-workspace pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 30rem;
  overflow: auto;
}
.generation-workspace button,
.generation-workspace h3 {
  overflow-wrap: anywhere;
}
.generation-actions,
.generation-line-range {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  margin-block: 1rem;
}
.generation-line-range label {
  flex: 1 1 9rem;
  min-width: 0;
}
</style>
