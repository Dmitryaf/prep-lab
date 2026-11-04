<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { SourcePreview } from "../../../../domain/source/preview.ts";
import type { SourceResolution } from "../../../../domain/source/contracts.ts";
const props = defineProps<{ preview: SourcePreview; busy: boolean }>();
const resolutions = defineModel<Record<string, SourceResolution>>(
  "resolutions",
  { required: true },
);
const headingMatches = defineModel<Record<string, Record<string, string>>>(
  "headingMatches",
  { required: true },
);
const emit = defineEmits<{ rematch: [matches: Record<string, string>] }>();
const selected = ref(""),
  matches = ref<Record<string, string>>({}),
  oldHeading = ref(""),
  newHeading = ref("");
watch(
  () => props.preview.id,
  () => {
    selected.value =
      props.preview.entries.find((entry) => entry.status === "conflict")?.id ||
      props.preview.entries[0]?.id ||
      "";
    matches.value = {};
  },
  { immediate: true },
);
const entry = computed(() =>
  props.preview.entries.find((entry) => entry.id === selected.value),
);
const labels = {
  added: "Новый материал",
  updated: "Изменён",
  renamed: "Переименован",
  removed: "Удаление",
  conflict: "Конфликт правок",
  unchanged: "Без изменений",
};
function choice(event: Event) {
  if (!entry.value) return;
  const choice = (event.target as HTMLSelectElement).value;
  if (choice === "edited")
    resolutions.value[entry.value.id] = {
      choice,
      markdown:
        entry.value.proposed ??
        entry.value.current ??
        entry.value.incoming ??
        "",
    };
  else if (choice === "current" || choice === "incoming" || choice === "remove")
    resolutions.value[entry.value.id] = { choice };
  else delete resolutions.value[entry.value.id];
}
function editText(event: Event) {
  if (entry.value)
    resolutions.value[entry.value.id] = {
      choice: "edited",
      markdown: (event.target as HTMLTextAreaElement).value,
    };
}
function addHeading() {
  if (!entry.value || !oldHeading.value.trim() || !newHeading.value.trim())
    return;
  (headingMatches.value[entry.value.id] ??= {})[newHeading.value.trim()] =
    oldHeading.value.trim();
  oldHeading.value = "";
  newHeading.value = "";
}
const editedText = computed(() => {
  const value = entry.value && resolutions.value[entry.value.id];
  return value?.choice === "edited" ? value.markdown : "";
});
</script>
<template>
  <section class="source-review" :aria-busy="busy">
    <h2>Просмотр изменений</h2>
    <p>{{ preview.source.name }} · Материалов: {{ preview.entries.length }}</p>
    <div class="source-review-grid">
      <div class="source-files" role="group" aria-label="Материалы предложения">
        <button
          v-for="item in preview.entries"
          :key="item.id"
          type="button"
          :aria-pressed="selected === item.id"
          @click="selected = item.id"
        >
          {{ item.path }} <span>{{ labels[item.status] }}</span>
        </button>
      </div>
      <div v-if="entry" class="source-change">
        <h3>{{ entry.path }}</h3>
        <p>{{ labels[entry.status] }}</p>
        <p v-if="entry.previousPath">Прежний путь: {{ entry.previousPath }}</p>
        <label :for="'resolution-' + entry.id"
          >Решение для {{ entry.path }}</label
        >
        <select
          :id="'resolution-' + entry.id"
          :disabled="busy"
          :value="resolutions[entry.id]?.choice || ''"
          @change="choice"
        >
          <option value="">
            {{
              entry.status === "conflict"
                ? "Выберите решение"
                : "Предложенное изменение"
            }}
          </option>
          <option value="incoming">Принять внешний текст</option>
          <option value="current">Сохранить мой текст</option>
          <option value="edited">Отредактировать</option>
          <option value="remove">Убрать материал из базы</option>
        </select>
        <template v-if="resolutions[entry.id]?.choice === 'edited'"
          ><label for="resolvedMarkdown">Текст после принятия</label
          ><textarea
            id="resolvedMarkdown"
            :value="editedText"
            rows="14"
            :disabled="busy"
            @input="editText"
          />
        </template>
        <details>
          <summary>Ранее принятый внешний текст</summary>
          <pre>{{ entry.baseline ?? "Материала не было" }}</pre>
        </details>
        <details :open="entry.status === 'conflict'">
          <summary>Мой текущий текст</summary>
          <pre>{{ entry.current ?? "Материала нет" }}</pre>
        </details>
        <details :open="entry.status !== 'unchanged'">
          <summary>Новый внешний текст</summary>
          <pre>{{ entry.incoming ?? "Файл отсутствует в новом снимке" }}</pre>
        </details>
        <details v-if="entry.proposed !== undefined">
          <summary>Предложенный итог</summary>
          <pre>{{ entry.proposed ?? "Материал будет убран" }}</pre>
        </details>
        <details>
          <summary>Сохранить ссылки после переименования заголовка</summary>
          <label for="oldSourceHeading">Прежний заголовок</label
          ><input id="oldSourceHeading" v-model="oldHeading" :disabled="busy" />
          <label for="newSourceHeading">Новый заголовок</label
          ><input id="newSourceHeading" v-model="newHeading" :disabled="busy" />
          <button
            type="button"
            :disabled="busy || !oldHeading.trim() || !newHeading.trim()"
            @click="addHeading"
          >
            Связать заголовки
          </button>
          <p v-for="(old, current) in headingMatches[entry.id]" :key="current">
            {{ old }} → {{ current }}
            <button
              type="button"
              @click="delete headingMatches[entry.id][current]"
            >
              Убрать соответствие
            </button>
          </p>
        </details>
        <details
          v-if="
            entry.status === 'added' &&
            preview.entries.some(
              (item) => item.status === 'removed' || item.status === 'conflict',
            )
          "
        >
          <summary>Это переименованный файл</summary>
          <label for="previousSourceFile"
            >Прежний материал для {{ entry.path }}</label
          >
          <select
            id="previousSourceFile"
            v-model="matches[entry.path]"
            :disabled="busy"
          >
            <option value="">Выберите материал</option>
            <option
              v-for="prior in preview.entries.filter(
                (item) => item.id !== entry!.id && item.current !== null,
              )"
              :key="prior.id"
              :value="prior.id"
            >
              {{ prior.previousPath || prior.path }}
            </option>
          </select>
          <button
            type="button"
            :disabled="busy || !matches[entry.path]"
            @click="emit('rematch', matches)"
          >
            Пересчитать с соответствиями
          </button>
          <p>После пересчёта потребуется заново выбрать решения конфликтов.</p>
        </details>
      </div>
    </div>
  </section>
</template>
