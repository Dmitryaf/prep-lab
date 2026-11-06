import { defineNitroPlugin } from "nitropack/runtime";
import { discussions } from "#server/application/discussions.ts";
import { closeDatabase } from "#server/infrastructure/storage/runtime.ts";
import { closeGenerations } from "#server/application/generation-runtime.ts";
import { closeCodex } from "#server/codex.ts";
import { closeAnalyses } from "#server/application/analysis-runtime.ts";
export default defineNitroPlugin((app) => {
  app.hooks.hook("close", async () => {
    await discussions.close();
    await closeGenerations();
    await closeAnalyses();
    closeCodex();
    closeDatabase();
  });
});
