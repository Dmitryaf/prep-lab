import { ref, shallowRef, watch, onBeforeUnmount, nextTick } from "vue";
import type {
  DiscussionMessage,
  DiscussionMaterial,
} from "#domain/discussion/contracts.ts";
import {
  getDiscussion,
  sendDiscussion,
  cancelDiscussion,
  previewDiscussion,
  DiscussionRequestError,
} from "#ui/features/study-discussion/api/discussion.ts";

export function useDiscussion(material: DiscussionMaterial) {
  const opened = ref(false),
    messages = ref<DiscussionMessage[]>([]),
    draft = ref(""),
    error = ref(""),
    busy = ref(false),
    loading = ref(false),
    loaded = ref(false),
    preparedPrompt = ref(""),
    previewing = ref(false),
    field = ref<HTMLTextAreaElement>();
  const controller = shallowRef<AbortController>();
  let generation = 0;
  async function load() {
    const version = ++generation;
    loading.value = true;
    previewing.value = false;
    loaded.value = false;
    error.value = "";
    preparedPrompt.value = "";
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
    if (
      busy.value ||
      previewing.value ||
      !loaded.value ||
      !draft.value.trim() ||
      !preparedPrompt.value
    )
      return;
    const text = draft.value,
      version = generation,
      key = material.materialKey,
      expectedPrompt = preparedPrompt.value;
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
        expectedPrompt,
      );
      if (version === generation) messages.value[index]!.status = "completed";
    } catch (cause) {
      if (version === generation) {
        if (cause instanceof DiscussionRequestError && cause.status === 409) {
          messages.value.splice(index - 1, 2);
          draft.value = text;
          preparedPrompt.value = "";
        } else messages.value[index]!.status = "interrupted";
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
  async function preview() {
    if (busy.value || previewing.value || !loaded.value || !draft.value.trim())
      return;
    const version = generation,
      text = draft.value,
      context = material.context,
      key = material.materialKey;
    previewing.value = true;
    error.value = "";
    preparedPrompt.value = "";
    try {
      const prompt = await previewDiscussion(key, text, context);
      if (
        version === generation &&
        text === draft.value &&
        context === material.context
      )
        preparedPrompt.value = prompt;
    } catch (cause) {
      if (version === generation)
        error.value =
          cause instanceof Error
            ? cause.message
            : "Не удалось показать задание.";
    } finally {
      if (version === generation) previewing.value = false;
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
      preparedPrompt.value = "";
      previewing.value = false;
    },
  );
  watch([draft, () => material.context], () => {
    preparedPrompt.value = "";
  });
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
    preparedPrompt,
    previewing,
    field,
    controller,
    load,
    toggle,
    send,
    preview,
    stop,
  };
}
