import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { z } from "zod";
import {
  promptInputSchema,
  importDraftSchema,
  type PromptInput,
} from "../../../../domain/prompts/contracts.ts";
import {
  projectDraftSchema,
  type ProjectDraft,
} from "../../../../domain/projects/draft.ts";
import { useMaterials } from "../../../entities/material/model/store.ts";
import { useSettings } from "../../../entities/preparation/model/settings.ts";
import { useProjectCatalog } from "../../../entities/project/model/catalog.ts";
import * as api from "../api/generations.ts";
export function useGeneration() {
  const router = useRouter(),
    route = useRoute(),
    materials = useMaterials(),
    settings = useSettings(),
    projects = useProjectCatalog();
  const scenario = ref<api.GenerationScenario>(
      route.query.scenario === "project" ? "project" : "import",
    ),
    request = ref(""),
    context = ref(""),
    selectedMaterials = ref<string[]>([]),
    uploads = ref<PromptInput["materials"]>([]);
  const history = ref<api.JobSummary[]>([]),
    current = ref<api.GenerationJob | null>(null),
    draft = ref<api.GenerationDraft | null>(null);
  const prompt = ref(""),
    error = ref(""),
    message = ref(""),
    busy = ref(false),
    streaming = ref(false),
    activeId = ref(""),
    partial = ref("");
  let controller: AbortController | undefined,
    disposed = false;
  const availableMaterials = computed(() => materials.knowledge.notes);
  const transmitted = computed(() => [
    ...availableMaterials.value
      .filter((note) => selectedMaterials.value.includes(note.id))
      .map((note) => ({ id: note.id, path: note.path, text: note.markdown })),
    ...uploads.value,
  ]);
  const input = computed<PromptInput>(() => ({
    profile: settings.settings.profile,
    request: request.value,
    context: context.value,
    materials: transmitted.value,
  }));
  const validInput = computed(
    () => promptInputSchema.safeParse(input.value).success,
  );
  const validDraft = computed(
    () =>
      !!current.value &&
      current.value.status === "completed" &&
      (current.value.scenario === "import"
        ? importDraftSchema
        : projectDraftSchema
      ).safeParse(draft.value).success,
  );
  const importDraft = computed({
    get: () => draft.value as z.infer<typeof importDraftSchema>,
    set: (value) => {
      draft.value = value;
    },
  });
  const projectDraft = computed({
    get: () => draft.value as ProjectDraft,
    set: (value) => {
      draft.value = value;
    },
  });
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
  async function reloadHistory() {
    history.value = (await api.listGenerations()).jobs;
  }
  function show(job: api.GenerationJob) {
    current.value = job;
    draft.value = job.draft;
    partial.value = job.raw;
  }
  async function open(id: string) {
    await run(async () => show(await api.readGeneration(id)));
  }
  async function addFiles(event: Event) {
    const files = [...((event.target as HTMLInputElement).files || [])];
    await run(async () => {
      const additions: PromptInput["materials"] = [];
      for (const file of files) {
        if (!/\.(?:md|txt|ts|tsx|js|jsx|vue|css|json|html)$/i.test(file.name))
          throw new Error(
            "Выберите текст, Markdown или фрагмент frontend-кода.",
          );
        if (file.size > 400_000)
          throw new Error(
            "Один фрагмент может содержать до 100 тысяч символов.",
          );
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(
            await file.arrayBuffer(),
          );
        } catch {
          throw new Error("Текстовые фрагменты должны использовать UTF-8.");
        }
        if (text.length > 100_000)
          throw new Error(
            "Один фрагмент может содержать до 100 тысяч символов.",
          );
        additions.push({
          id: "upload-" + crypto.randomUUID(),
          path: file.name,
          text,
        });
      }
      const candidate = {
        ...input.value,
        request: request.value || "Подготовка контекста",
        materials: [...transmitted.value, ...additions],
      };
      if (!promptInputSchema.safeParse(candidate).success)
        throw new Error(
          "Контекст может содержать до 30 материалов и 250 тысяч символов вместе с задачей и рассказом.",
        );
      uploads.value = [...uploads.value, ...additions];
    });
    (event.target as HTMLInputElement).value = "";
  }
  async function preview() {
    await run(async () => {
      prompt.value = await api.previewGeneration(
        scenario.value,
        promptInputSchema.parse(input.value),
      );
    });
  }
  async function generate() {
    if (!prompt.value || streaming.value || busy.value) return;
    await run(async () => {
      const snapshot = promptInputSchema.parse(input.value),
        selectedScenario = scenario.value;
      const latest = await api.previewGeneration(selectedScenario, snapshot);
      if (latest !== prompt.value) {
        prompt.value = latest;
        message.value =
          "Промпт изменился. Проверьте новое задание перед отправкой.";
        return;
      }
      streaming.value = true;
      activeId.value = "";
      partial.value = "";
      current.value = null;
      draft.value = null;
      controller = new AbortController();
      try {
        await api.readGenerationStream(
          await api.startGeneration(
            selectedScenario,
            snapshot,
            prompt.value,
            controller.signal,
          ),
          (event) => {
            if ("id" in event) activeId.value = event.id;
            if ("delta" in event) partial.value += event.delta;
          },
        );
      } catch (failure) {
        if (controller.signal.aborted)
          message.value = "Подготовка отменена. Полученный фрагмент сохранён.";
        else throw failure;
      } finally {
        streaming.value = false;
        controller = undefined;
        if (!disposed) {
          if (activeId.value) show(await api.readGeneration(activeId.value));
          await reloadHistory();
        }
      }
    });
  }
  async function cancel() {
    if (!activeId.value || !streaming.value) return;
    try {
      await api.cancelGeneration(activeId.value);
      controller?.abort();
    } catch (failure) {
      error.value =
        failure instanceof Error
          ? failure.message
          : "Не удалось отменить задание.";
    }
  }
  async function accept() {
    if (!current.value || !draft.value || !validDraft.value) return;
    await run(async () => {
      const result = await api.acceptGeneration(
        current.value!.id,
        current.value!.revision,
        draft.value!,
      );
      await reloadHistory();
      if (result.previewId)
        await router.push({
          path: "/sources",
          query: { preview: result.previewId },
        });
      else if (result.projectId) {
        await projects.initialize();
        await router.push({
          path: "/projects",
          query: { project: result.projectId },
        });
      }
    });
  }
  function newDraft() {
    current.value = null;
    draft.value = null;
    partial.value = "";
    error.value = "";
  }
  watch(
    [
      scenario,
      request,
      context,
      selectedMaterials,
      uploads,
      () => settings.settings.profile,
    ],
    () => {
      prompt.value = "";
    },
    { deep: true },
  );
  onMounted(() => void run(reloadHistory));
  onBeforeUnmount(() => {
    disposed = true;
    controller?.abort();
  });
  return {
    scenario,
    request,
    context,
    selectedMaterials,
    uploads,
    availableMaterials,
    transmitted,
    input,
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
    addFiles,
    preview,
    generate,
    cancel,
    accept,
    open,
    newDraft,
    refresh: () =>
      current.value ? open(current.value.id) : run(reloadHistory),
  };
}
