import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSettings } from "#ui/entities/preparation/model/settings.ts";
import { useMaterials } from "#ui/entities/material/model/store.ts";
import { useProjectCatalog } from "#ui/entities/project/model/catalog.ts";
import {
  analysisInputLimits,
  includeAnalysisPath,
  isExcludedAnalysisPath,
} from "#domain/analysis/input.ts";
import * as api from "#ui/features/analyze-source/api/analysis.ts";

export function useSourceAnalysis() {
  const route = useRoute(),
    router = useRouter();
  const settings = useSettings(),
    materials = useMaterials(),
    projects = useProjectCatalog();
  const scenario = ref<api.AnalysisJob["scenario"]>(
    route.query.scenario === "import" ? "import" : "project",
  );
  const sourceKind = ref<"path" | "files">("path");
  const paths = ref(""),
    context = ref("");
  const files = ref<File[]>([]),
    jobs = ref<api.AnalysisJob[]>([]);
  const current = ref<api.AnalysisJob | null>(null);
  const selected = ref<string[]>([]),
    busy = ref(false),
    error = ref("");
  let disposed = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  let requestVersion = 0;
  const running = computed(() => current.value?.status === "running");
  const skippedFiles = computed(() =>
    files.value.filter((file) => {
      const path = file.webkitRelativePath || file.name;
      return (
        isExcludedAnalysisPath(path) ||
        (!/\.zip$/i.test(path) && !includeAnalysisPath(path, scenario.value))
      );
    }),
  );
  const canStart = computed(
    () =>
      !busy.value &&
      (sourceKind.value === "path"
        ? !!paths.value.trim()
        : files.value.length > skippedFiles.value.length),
  );
  const connections = computed(() => {
    const grouped = new Map<string, api.AnalysisJob>();
    for (const job of [...jobs.value].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )) {
      if (!["accepted", "unchanged"].includes(job.status)) continue;
      if (!grouped.has(job.connectionId)) grouped.set(job.connectionId, job);
    }
    return [...grouped.values()];
  });
  const pending = computed(() =>
    jobs.value.filter(
      (job) =>
        job.id !== current.value?.id &&
        !["accepted", "unchanged"].includes(job.status),
    ),
  );
  async function refreshList() {
    const result = await api.listAnalyses();
    if (!disposed) jobs.value = result.jobs;
  }
  function show(job: api.AnalysisJob) {
    if (disposed) return;
    if (current.value?.id !== job.id || current.value?.status !== job.status) {
      selected.value = job.changes
        .filter(
          (change) => change.action === "add" || change.action === "update",
        )
        .map((change) => change.id);
    }
    current.value = job;
  }
  function stopPolling() {
    clearTimeout(timer);
    timer = undefined;
  }
  function schedulePoll(id: string) {
    stopPolling();
    if (disposed || current.value?.status !== "running") return;
    const version = requestVersion;
    timer = setTimeout(async () => {
      try {
        const job = await api.readAnalysis(id);
        if (
          disposed ||
          route.query.analysis !== id ||
          version !== requestVersion
        )
          return;
        show(job);
        if (job.status === "running") schedulePoll(id);
        else await refreshList();
      } catch (cause) {
        if (disposed) return;
        error.value =
          cause instanceof Error
            ? cause.message
            : "Не удалось обновить состояние анализа.";
      }
    }, 2000);
  }
  async function run(action: () => Promise<void>) {
    busy.value = true;
    error.value = "";
    try {
      await action();
    } catch (cause) {
      if (!disposed)
        error.value =
          cause instanceof Error
            ? cause.message
            : "Не удалось выполнить действие.";
    } finally {
      if (!disposed) busy.value = false;
    }
  }
  async function open(id: string) {
    await router.push({ path: "/sources", query: { analysis: id } });
  }
  async function loadCurrent() {
    stopPolling();
    const id =
      typeof route.query.analysis === "string" ? route.query.analysis : "";
    const version = ++requestVersion;
    if (!id) {
      current.value = null;
      error.value = "";
      return;
    }
    await run(async () => {
      const job = await api.readAnalysis(id);
      if (version !== requestVersion || disposed) return;
      show(job);
      schedulePoll(id);
    });
  }
  async function start() {
    await run(async () => {
      const uploads: api.AnalysisInput["files"] = [];
      let total = 0;
      if (sourceKind.value === "files")
        for (const file of files.value) {
          const path = file.webkitRelativePath || file.name;
          if (
            isExcludedAnalysisPath(path) ||
            (!/\.zip$/i.test(path) &&
              !includeAnalysisPath(path, scenario.value))
          )
            continue;
          total += file.size;
          if (total > analysisInputLimits.totalBytes)
            throw new Error(
              "Выбранные файлы слишком большие. Укажите путь к папке или уменьшите загрузку.",
            );
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 8192),
            );
          uploads.push({
            path,
            encoding: "base64",
            content: btoa(binary),
          });
        }
      if (sourceKind.value === "files" && !uploads.length)
        throw new Error("В выбранных файлах нет материалов для анализа.");
      const job = await api.startAnalysis({
        scenario: scenario.value,
        profile: settings.settings.profile,
        paths:
          sourceKind.value === "path"
            ? paths.value
                .split(/\r?\n/)
                .map((path) => path.trim())
                .filter(Boolean)
            : [],
        files: uploads,
        context: context.value,
      });
      show(job);
      await open(job.id);
      await refreshList();
    });
  }
  async function cancel() {
    if (!current.value) return;
    requestVersion++;
    stopPolling();
    await run(async () => {
      show(await api.cancelAnalysis(current.value!.id));
      schedulePoll(current.value!.id);
      await refreshList();
    });
  }
  async function accept() {
    if (!current.value || current.value.status !== "ready") return;
    await run(async () => {
      show(await api.acceptAnalysis(current.value!.id, selected.value));
      await Promise.all([
        refreshList(),
        materials.fetchKnowledge(),
        projects.initialize(),
      ]);
    });
  }
  async function update(job: api.AnalysisJob) {
    await run(async () => {
      const next = await api.updateAnalysis(job.id);
      show(next);
      await open(next.id);
      await refreshList();
    });
  }
  async function newSource() {
    paths.value = "";
    context.value = "";
    files.value = [];
    await router.push({ path: "/sources" });
  }
  function selectFiles(event: Event) {
    files.value = [...((event.target as HTMLInputElement).files || [])];
  }
  watch(() => route.query.analysis, loadCurrent);
  onMounted(async () => {
    await run(refreshList);
    await loadCurrent();
  });
  onBeforeUnmount(() => {
    disposed = true;
    requestVersion++;
    stopPolling();
  });
  return {
    scenario,
    sourceKind,
    paths,
    context,
    files,
    skippedFiles,
    jobs,
    current,
    selected,
    busy,
    error,
    running,
    canStart,
    connections,
    pending,
    start,
    cancel,
    accept,
    update,
    open,
    newSource,
    selectFiles,
    refresh: loadCurrent,
  };
}
