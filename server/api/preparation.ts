import { defineEventHandler } from "h3";
import { getPreparation } from "../infrastructure/storage/runtime.ts";
import { handlePreparation } from "../infrastructure/http/preparation.ts";
export default defineEventHandler(async (event) => {
  await handlePreparation(event.node.req, event.node.res, getPreparation);
});
