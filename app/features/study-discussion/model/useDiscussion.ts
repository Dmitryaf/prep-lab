import { ref, shallowRef, watch, onBeforeUnmount, nextTick } from "vue";
import type {
  DiscussionMessage,
  DiscussionMaterial,
} from "../../../../domain/discussion/contracts.ts";
import {
  getDiscussion,
  sendDiscussion,
  cancelDiscussion,
} from "../api/discussion.ts";

export function useDiscussion(material: DiscussionMaterial) {
  const opened = ref(false),
    messages = ref<DiscussionMessage[]>([]),
    draft = ref(""),
    error = ref(""),
    busy = ref(false),
    loading = ref(false),
    loaded = ref(false),
    field = ref<HTMLTextAreaElement>();
  const controller = shallowRef<AbortController>();
  let generation = 0;
  async function load() {
    const version = ++generation;
    loading.value = true;
    loaded.value = false;
    error.value = "";
    try {
      const data = await getDiscussion(material.materialKey);
      if (version !== generation) return;
      messages.value = data.messages;
      busy.value = data.busy;
      loaded.value = true;
    } catch (cause) {
      if (version === generation)
        error.value =
          cause instanceof Error
            ? cause.message
            : "Не удалось загрузить обсуждение.";
    } finally {
      if (version === generation) loading.value = false;
    }
  }
  async function toggle() {
    opened.value = !opened.value;
    if (opened.value) {
      if (!controller.value) await load();
      await nextTick();
      field.value?.focus();
    }
  }
  async function send() {
    if (busy.value || !loaded.value || !draft.value.trim()) return;
    const text = draft.value,
      version = generation,
      key = material.materialKey;
    const abort = new AbortController();
    controller.value = abort;
    busy.value = true;
    error.value = "";
    messages.value.push(
      { role: "user", text, status: "completed" },
      { role: "assistant", text: "", status: "pending" },
    );
    const index = messages.value.length - 1;
    try {
      draft.value = "";
      await sendDiscussion(
        key,
        text,
        material.context,
        abort.signal,
        (delta) => {
          if (version === generation) messages.value[index]!.text += delta;
        },
      );
      if (version === generation) messages.value[index]!.status = "completed";
    } catch (cause) {
      if (version === generation) {
        messages.value[index]!.status = "interrupted";
        error.value =
          cause instanceof Error ? cause.message : "Не удалось получить ответ.";
      }
    } finally {
      if (version === generation) {
        busy.value = false;
        controller.value = undefined;
      }
    }
  }
  async function stop() {
    try {
      await cancelDiscussion(material.materialKey);
    } catch {
      error.value =
        "Не удалось остановить запрос. Обновите обсуждение для проверки состояния.";
    }
  }
  watch(
    () => material.materialKey,
    () => {
      generation++;
      controller.value?.abort();
      controller.value = undefined;
      opened.value = false;
      messages.value = [];
      draft.value = "";
      busy.value = false;
      loaded.value = false;
    },
  );
  onBeforeUnmount(() => {
    generation++;
    controller.value?.abort();
  });
  return {
    opened,
    messages,
    draft,
    error,
    busy,
    loading,
    loaded,
    field,
    controller,
    load,
    toggle,
    send,
    stop,
  };
}
