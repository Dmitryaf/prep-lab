import { defineEventHandler } from "h3";
import { handlePrompts } from "#server/infrastructure/http/prompts.ts";
import { getPrompts } from "#server/infrastructure/storage/runtime.ts";
import { readBundledPrompts } from "#server/infrastructure/prompts/bundled.ts";
export default defineEventHandler(async (event) => {
  await handlePrompts(
    event.node.req,
    event.node.res,
    getPrompts,
    readBundledPrompts,
  );
});
