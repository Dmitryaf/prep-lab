import { defineStore } from "pinia";
import { computed, onScopeDispose, ref, shallowRef } from "vue";
import type { Progress } from "../../../../domain/interview/state.ts";
import {
  loadState,
  storageKey,
} from "../../../../domain/interview/saved-state.ts";
import {
  readPreparation,
  writePreparation,
  migratePreparation,
  PreparationRequestError,
} from "../api/preparation.ts";
import { useNotices } from "../../../shared/model/notices.ts";

export const usePreparation = defineStore("preparation", () => {
  const progress = shallowRef<Progress>(loadState({ getItem: () => null }));
  const revision = ref(0),
    ready = ref(false),
    saving = ref(false),
    loadError = ref(""),
    saveError = ref("");
  const notices = useNotices();
  const sessions = computed(() => [
    ...Object.values(progress.value.daily),
    ...Object.values(progress.value.sessions),
  ]);
  const channel =
    typeof BroadcastChannel === "undefined"
      ? undefined
      : new BroadcastChannel("frontend-lab-preparation");
  let initializing: Promise<void> | undefined;
  function apply(envelope: { state: Progress; revision: number }) {
    if (envelope.revision < revision.value) return;
    progress.value = envelope.state;
    revision.value = envelope.revision;
  }
  async function initialize() {
    if (saving.value) return;
    if (initializing) return initializing;
    initializing = (async () => {
      loadError.value = "";
      try {
        let envelope = await readPreparation();
        try {
          const keys = [
            storageKey,
            "project-map-review-v2",
            "project-map-review-v1",
          ];
          if (keys.some((key) => localStorage.getItem(key) !== null))
            envelope = await migratePreparation(loadState(localStorage));
        } catch (cause) {
          loadError.value =
            cause instanceof PreparationRequestError
              ? cause.message
              : "Прежние данные браузера повреждены. Исходная запись сохранена; автоматический перенос остановлен.";
        }
        apply(envelope);
      } catch {
        loadError.value =
          "Данные экземпляра недоступны. Прежние файлы и запись браузера сохранены.";
      } finally {
        ready.value = true;
        initializing = undefined;
      }
    })();
    return initializing;
  }
  async function persist(next: Progress) {
    saveError.value = "";
    if (!ready.value || loadError.value || saving.value) {
      saveError.value = loadError.value || "Подождите завершения сохранения.";
      notices.notify(saveError.value);
      return false;
    }
    saving.value = true;
    try {
      apply(await writePreparation(next, revision.value));
      channel?.postMessage({ revision: revision.value });
      return true;
    } catch (cause) {
      if (cause instanceof PreparationRequestError && cause.status === 409) {
        try {
          apply(await readPreparation());
        } catch {
          /* Keep the last accepted state. */
        }
      }
      saveError.value =
        cause instanceof Error
          ? cause.message
          : "Изменение не сохранено. Прежняя запись сохранена.";
      notices.notify(saveError.value);
      return false;
    } finally {
      saving.value = false;
    }
  }
  const refresh = () => {
    void initialize();
  };
  channel?.addEventListener("message", refresh);
  window.addEventListener("focus", refresh);
  onScopeDispose(() => {
    channel?.close();
    window.removeEventListener("focus", refresh);
  });
  void initialize();
  return {
    progress,
    revision,
    loadError,
    saveError,
    sessions,
    ready,
    saving,
    persist,
    initialize,
  };
});
