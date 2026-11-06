import { defineEventHandler } from "h3";
import { generations } from "#server/application/generation-runtime.ts";
import { getReviewedProjects } from "#server/infrastructure/storage/runtime.ts";
import { handleGenerations } from "#server/infrastructure/http/generations.ts";
export default defineEventHandler(async (event) => {
  await handleGenerations(event.node.req, event.node.res, generations, () =>
    getReviewedProjects().revision(),
  );
});
