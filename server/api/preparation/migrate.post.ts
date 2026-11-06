import { defineEventHandler } from "h3";
import { getPreparation } from "#server/infrastructure/storage/runtime.ts";
import { handlePreparation } from "#server/infrastructure/http/preparation.ts";
export default defineEventHandler(async (event) => {
  await handlePreparation(event.node.req, event.node.res, getPreparation);
});
