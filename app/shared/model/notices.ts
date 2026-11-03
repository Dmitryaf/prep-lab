import { defineStore } from "pinia";
import { ref } from "vue";

export const useNotices = defineStore("notices", () => {
  const message = ref("");
  function notify(text: string) {
    message.value = text;
  }
  return { message, notify };
});
