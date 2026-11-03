import { defineEventHandler } from "h3";
import { getSettings } from "../../infrastructure/storage/runtime.ts";
import { handleSettings } from "../../infrastructure/http/settings.ts";
export default defineEventHandler(async (event) => {
  await handleSettings(event.node.req, event.node.res, getSettings);
});
