import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import * as api from "#ui/features/connect-source/api/sources.ts";
import type { SourcePreview } from "#domain/source/preview.ts";
import type { SourceResolution } from "#domain/source/contracts.ts";
import { useMaterials } from "#ui/entities/material/model/store.ts";
export function useSources() {
  const route = useRoute();
  const catalog = ref<api.SourceCatalog>({
    revision: 0,
    sources: [],
    roots: [],
    pending: [],
  });
  const preview = ref<SourcePreview | null>(null),
    busy = ref(false),
    error = ref(""),
    message = ref("");
  const name = ref(""),
    sourceId = ref(""),
    kind = ref<"upload" | "folder">("upload"),
    rootId = ref(""),
    includeInterviews = ref(true);
  const files = ref<File[]>([]),
    resolutions = ref<Record<string, SourceResolution>>({}),
    headingMatches = ref<Record<string, Record<string, string>>>({});
  const edit = ref<{
    sourceId: string;
    documentId: string;
    markdown: string;
  } | null>(null);
  const report = ref<Awaited<ReturnType<typeof api.inspectSource>> | null>(
    null,
  );
  const materials = useMaterials();
  const canAccept = computed(
    () =>
      !!preview.value &&
      !busy.value &&
      preview.value.entries.every(
        (entry) => entry.status !== "conflict" || resolutions.value[entry.id],
      ),
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
  const reload = async () => {
    catalog.value = await api.readSources();
  };
  function show(value: SourcePreview) {
    preview.value = value;
    resolutions.value = value.resolutions;
    headingMatches.value = value.headingMatches;
    report.value = null;
    edit.value = null;
  }
  async function prepare() {
    await run(async () => {
      const uploads: { path: string; encoding: "base64"; content: string }[] =
        [];
      let total = 0;
      if (files.value.length > 200)
        throw new Error("Можно загрузить до 200 Markdown-файлов или один ZIP.");
      for (const file of files.value) {
        total += file.size;
        if (total > 8_000_000)
          throw new Error("Общий размер файлов не должен превышать 8 МБ.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let start = 0; start < bytes.length; start += 8192)
          binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
        uploads.push({
          path: file.webkitRelativePath || file.name,
          encoding: "base64",
          content: btoa(binary),
        });
      }
      const result = await api.prepareSource({
        name: name.value,
        ...(sourceId.value ? { sourceId: sourceId.value } : {}),
        kind: kind.value,
        includeInterviews: includeInterviews.value,
        ...(kind.value === "folder"
          ? { rootId: rootId.value }
          : { files: uploads }),
      });
      show(result.preview);
      await reload();
      if (result.skipped)
        message.value = `Пропущено служебных или неподдерживаемых файлов: ${result.skipped}.`;
    });
  }
  async function open(id: string) {
    await run(async () => show(await api.readPreview(id)));
  }
  function update(id: string) {
    const source = catalog.value.sources.find((source) => source.id === id);
    if (!source) return;
    sourceId.value = id;
    name.value = source.name;
    kind.value = source.kind;
    rootId.value = source.rootId || "";
    includeInterviews.value = source.includeInterviews;
    preview.value = null;
    edit.value = null;
    files.value = [];
    document.getElementById("sourceName")?.focus();
  }
  async function accept() {
    if (!preview.value) return;
    await run(async () => {
      const current = preview.value!;
      await api.acceptSource(current.id, {
        revision: current.revision,
        resolutions: resolutions.value,
        headingMatches: headingMatches.value,
      });
      preview.value = null;
      report.value = null;
      files.value = [];
      await reload();
      await materials.fetchKnowledge();
      message.value = "Материалы обновлены.";
    });
  }
  async function saveReview() {
    if (!preview.value) return;
    await run(async () => {
      await api.saveReview(preview.value!.id, {
        revision: preview.value!.revision,
        resolutions: resolutions.value,
        headingMatches: headingMatches.value,
      });
      message.value = "Правки просмотра сохранены.";
    });
  }
  async function inspect() {
    if (!preview.value) return;
    await run(async () => {
      report.value = await api.inspectSource(preview.value!.id, {
        revision: preview.value!.revision,
        resolutions: resolutions.value,
        headingMatches: headingMatches.value,
      });
    });
  }
  async function discard() {
    if (!preview.value) return;
    await run(async () => {
      await api.discardSource(preview.value!.id);
      preview.value = null;
      await reload();
    });
  }
  async function saveEdit() {
    if (!edit.value) return;
    await run(async () => {
      show(
        await api.editMaterial({
          ...edit.value,
          revision: catalog.value.revision,
        }),
      );
      await reload();
    });
  }
  async function rematch(matches: Record<string, string>) {
    if (!preview.value) return;
    await run(async () => {
      show(await api.rematchFiles(preview.value!.id, matches));
      await reload();
    });
  }
  onMounted(
    () =>
      void run(async () => {
        await reload();
        if (typeof route.query.preview === "string")
          show(await api.readPreview(route.query.preview));
      }),
  );
  return {
    catalog,
    preview,
    busy,
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
    prepare,
    open,
    update,
    accept,
    saveReview,
    inspect,
    discard,
    saveEdit,
    rematch,
  };
}
