import { defineNuxtPlugin } from "#app";
import { trackWindow } from "../shared/lib/lifecycle.ts";
export default defineNuxtPlugin(() => {
  trackWindow();
});
