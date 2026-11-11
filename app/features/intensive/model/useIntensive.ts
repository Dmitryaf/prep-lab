import { ref, shallowRef } from "vue";
import type {
  IntensiveGoal,
  IntensiveSnapshot,
} from "#domain/intensive/contracts.ts";
import {
  getIntensive,
  getIntensiveCatalog,
  prepareIntensive,
  proposeIntensive,
  acceptIntensive,
  saveIntensiveProgress,
  addIntensiveRepeat,
  setIntensiveRepeat,
  type IntensiveCatalog,
  type ProgressInput,
} from "#ui/features/intensive/api/intensive.ts";

export function useIntensive() {
  const snapshot = shallowRef<IntensiveSnapshot | null>(null);
  const catalog = shallowRef<IntensiveCatalog>({ notes: [], projects: [] });
  const loading = ref(true);
  const pending = ref(0);
  const error = ref("");
  let queue = Promise.resolve();

  async function load() {
    loading.value = true;
    error.value = "";
    try {
      const [saved, available] = await Promise.all([
        getIntensive(),
        getIntensiveCatalog(),
      ]);
      snapshot.value = saved;
      catalog.value = available;
    } catch (cause) {
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить интенсив.";
    } finally {
      loading.value = false;
    }
  }
  async function refreshCatalog() {
    try {
      catalog.value = await getIntensiveCatalog();
      return true;
    } catch (cause) {
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось обновить список материалов.";
      return false;
    }
  }

  function mutate(action: (revision: number) => Promise<IntensiveSnapshot>) {
    pending.value++;
    const result = queue
      .then(async () => {
        if (!snapshot.value) return false;
        error.value = "";
        try {
          snapshot.value = await action(snapshot.value.revision);
          return true;
        } catch (cause) {
          error.value =
            cause instanceof Error
              ? cause.message
              : "Не удалось сохранить интенсив.";
          return false;
        }
      })
      .finally(() => {
        pending.value--;
      });
    queue = result.then(() => undefined);
    return result;
  }

  return {
    snapshot,
    catalog,
    loading,
    pending,
    error,
    load,
    refreshCatalog,
    prepare: (goal: IntensiveGoal) =>
      mutate((revision) => prepareIntensive(goal, revision)),
    propose: (goal: IntensiveGoal, ids: string[]) =>
      mutate((revision) => proposeIntensive(goal, ids, revision)),
    accept: (ids: string[]) =>
      mutate((revision) => acceptIntensive(ids, revision)),
    save: (id: string, progress: ProgressInput) =>
      mutate((revision) => saveIntensiveProgress(id, progress, revision)),
    repeat: (id: string, text: string) =>
      mutate((revision) => addIntensiveRepeat(id, text, revision)),
    toggleRepeat: (id: string, done: boolean) =>
      mutate((revision) => setIntensiveRepeat(id, done, revision)),
  };
}
