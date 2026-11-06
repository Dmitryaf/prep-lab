import { defineEventHandler } from "h3";
import { analyses } from "#server/application/analysis-runtime.ts";
import { getSources } from "#server/infrastructure/storage/runtime.ts";
import { handleAnalysis } from "#server/infrastructure/http/analysis.ts";
export default defineEventHandler(async (event) => {
  await handleAnalysis(event.node.req, event.node.res, analyses, () =>
    getSources()
      .roots()
      .map((root) => root.path),
  );
});
