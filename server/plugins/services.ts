import { defineNitroPlugin } from "nitropack/runtime";
import { discussions } from "../application/discussions.ts";
import { closeDatabase } from "../infrastructure/storage/runtime.ts";
import { closeGenerations } from "../application/generation-runtime.ts";
import { closeCodex } from "../codex.ts";
export default defineNitroPlugin((app) => {
  app.hooks.hook("close", async () => {
    await discussions.close();
    await closeGenerations();
    closeCodex();
    closeDatabase();
  });
});
