import { defineStore } from "pinia";
import { onScopeDispose, ref } from "vue";

export const useNotices = defineStore("notices", () => {
  const message = ref("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancelTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function notify(text: string, kind: "info" | "success" | "error" = "info") {
    cancelTimer();
    message.value = text;
    if (kind === "success" && text) {
      timer = setTimeout(() => {
        message.value = "";
        timer = undefined;
      }, 3000);
    }
  }
  onScopeDispose(cancelTimer);
  return { message, notify };
});
