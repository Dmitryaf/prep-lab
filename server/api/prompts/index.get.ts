import { defineEventHandler } from "h3";
import { handlePrompts } from "../../infrastructure/http/prompts.ts";
import { getPrompts } from "../../infrastructure/storage/runtime.ts";
import { readBundledPrompts } from "../../infrastructure/prompts/bundled.ts";
export default defineEventHandler(async (event) => {
  await handlePrompts(
    event.node.req,
    event.node.res,
    getPrompts,
    readBundledPrompts,
  );
});
