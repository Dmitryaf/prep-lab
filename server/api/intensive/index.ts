import { defineEventHandler } from "h3";
import { intensive } from "#server/application/intensive/runtime.ts";
import { handleIntensive } from "#server/infrastructure/intensive/http.ts";
export default defineEventHandler(async (event) => {
  await handleIntensive(event.node.req, event.node.res, intensive);
});
