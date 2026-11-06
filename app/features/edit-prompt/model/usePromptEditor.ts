import { computed, onMounted, ref, watch } from "vue";
import { useMaterials } from "#ui/entities/material/model/store.ts";
import { useSettings } from "#ui/entities/preparation/model/settings.ts";
import { type PromptId } from "#domain/prompts/contracts.ts";
import {
  readPrompts,
  savePrompt,
  previewPrompt,
  type PromptState,
} from "#ui/features/edit-prompt/api/prompts.ts";

export function usePromptEditor() {
  const prompts = ref<PromptState[]>([]),
    selectedId = ref<PromptId>("discussion"),
    text = ref("");
  const busy = ref(false),
    error = ref(""),
    message = ref(""),
    composed = ref("");
  const request = ref(""),
    context = ref(""),
    selectedMaterials = ref<string[]>([]);
  const materials = useMaterials(),
    settings = useSettings();
  const selected = computed(() =>
    prompts.value.find((state) => state.template.id === selectedId.value),
  );
  const dirty = computed(
    () => !!selected.value && text.value !== selected.value.text,
  );
  const availableMaterials = computed(() => materials.knowledge.notes);
  const transmitted = computed(() =>
    availableMaterials.value
      .filter((note) => selectedMaterials.value.includes(note.id))
      .map((note) => ({ id: note.id, path: note.path, text: note.markdown })),
  );
  async function run(action: () => Promise<void>) {
    busy.value = true;
    error.value = "";
    message.value = "";
    try {
      await action();
    } catch (failure) {
      error.value =
        failure instanceof Error
          ? failure.message
          : "Не удалось выполнить действие.";
    } finally {
      busy.value = false;
    }
  }
  function update(state: PromptState) {
    const index = prompts.value.findIndex(
      (item) => item.template.id === state.template.id,
    );
    prompts.value[index] = state;
    text.value = state.text;
    composed.value = "";
  }
  function select(id: PromptId) {
    if (dirty.value || busy.value) return;
    selectedId.value = id;
    text.value = selected.value?.text || "";
    composed.value = "";
  }
  function discard() {
    text.value = selected.value?.text || "";
    composed.value = "";
  }
  async function save(reset = false) {
    if (!selected.value) return;
    await run(async () => {
      update(await savePrompt(selected.value!, reset ? null : text.value));
      message.value = reset
        ? "Восстановлен встроенный промпт."
        : "Промпт сохранён.";
    });
  }
  async function preview() {
    if (!selected.value) return;
    await run(async () => {
      composed.value = (
        await previewPrompt(selected.value!.template.id, text.value, {
          profile: settings.settings.profile,
          request: request.value,
          context: context.value,
          materials: transmitted.value,
        })
      ).prompt;
    });
  }
  async function reload() {
    await run(async () => {
      prompts.value = (await readPrompts()).prompts;
      text.value = selected.value?.text || "";
      composed.value = "";
    });
  }
  watch(
    [
      text,
      request,
      context,
      selectedMaterials,
      () => settings.settings.profile,
    ],
    () => {
      composed.value = "";
    },
    { deep: true },
  );
  onMounted(() => void reload());
  return {
    prompts,
    selectedId,
    selected,
    text,
    busy,
    error,
    message,
    dirty,
    request,
    context,
    availableMaterials,
    selectedMaterials,
    transmitted,
    composed,
    select,
    discard,
    save,
    preview,
    reload,
  };
}
