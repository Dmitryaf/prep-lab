import { defineNuxtPlugin } from "#app";
import { trackWindow } from "#ui/shared/lib/lifecycle.ts";
export default defineNuxtPlugin(() => {
  trackWindow();
});
