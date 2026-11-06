import { defineEventHandler } from "h3";
import { getSettings } from "#server/infrastructure/storage/runtime.ts";
import { handleSettings } from "#server/infrastructure/http/settings.ts";
export default defineEventHandler(async (event) => {
  await handleSettings(event.node.req, event.node.res, getSettings);
});
