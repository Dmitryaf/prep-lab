import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import type { InstanceSettings } from "../../../../domain/instance/contracts.ts";
import { requestSettings, writeSettings } from "../api/settings.ts";
import { useNotices } from "../../../shared/model/notices.ts";

export const useSettings = defineStore("instance-settings", () => {
  const settings = shallowRef<InstanceSettings>({
    sourceRoot: "",
    profile: "vue",
  });
  const revision = ref(0),
    ready = ref(false),
    saving = ref(false),
    error = ref("");
  const { notify } = useNotices();
  let initializing: Promise<void> | undefined;
  function apply(value: Awaited<ReturnType<typeof requestSettings>>) {
    settings.value = value.settings;
    revision.value = value.revision;
  }
  function initialize() {
    return (initializing ??= (async () => {
      try {
        let current = await requestSettings();
        const sourceRoot = localStorage.getItem("project-map-source-root-v1");
        if (sourceRoot !== null)
          current = await requestSettings("POST", { sourceRoot });
        apply(current);
        error.value = "";
      } catch (cause) {
        error.value =
          cause instanceof Error ? cause.message : "Настройки недоступны.";
        notify(error.value);
      } finally {
        ready.value = true;
        initializing = undefined;
      }
    })());
  }
  async function save(patch: Partial<InstanceSettings>) {
    await initialize();
    if (error.value || saving.value) return false;
    saving.value = true;
    try {
      apply(
        await writeSettings({ ...settings.value, ...patch }, revision.value),
      );
      return true;
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Изменение не сохранено.",
      );
      await initialize();
      return false;
    } finally {
      saving.value = false;
    }
  }
  return { settings, revision, ready, saving, initialize, save };
});
