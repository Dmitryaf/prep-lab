import { defineNitroPlugin } from "nitropack/runtime";
import { discussions } from "../application/discussions.ts";
import { closeDatabase } from "../infrastructure/storage/runtime.ts";
export default defineNitroPlugin((app) => {
  app.hooks.hook("close", async () => {
    await discussions.close();
    closeDatabase();
  });
});
