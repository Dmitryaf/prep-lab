import { defineEventHandler } from "h3";
import { handleSources } from "../../infrastructure/http/sources.ts";
import { getSources } from "../../infrastructure/storage/runtime.ts";
import { readKnowledge } from "../../application/knowledge.ts";
import { readBundledKnowledge } from "../../infrastructure/knowledge/bundled.ts";
export default defineEventHandler(async (event) => {
  await handleSources(event.node.req, event.node.res, getSources, () =>
    readKnowledge({ common: readBundledKnowledge }),
  );
});
