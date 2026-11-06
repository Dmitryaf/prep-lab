import { defineEventHandler } from "h3";
import { handleSources } from "#server/infrastructure/http/sources.ts";
import { getSources } from "#server/infrastructure/storage/runtime.ts";
import { readKnowledge } from "#server/application/knowledge.ts";
import { readBundledKnowledge } from "#server/infrastructure/knowledge/bundled.ts";
export default defineEventHandler(async (event) => {
  await handleSources(event.node.req, event.node.res, getSources, () =>
    readKnowledge({ common: readBundledKnowledge }),
  );
});
