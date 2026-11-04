import { defineEventHandler } from "h3";
import { generations } from "../../application/generation-runtime.ts";
import { getReviewedProjects } from "../../infrastructure/storage/runtime.ts";
import { handleGenerations } from "../../infrastructure/http/generations.ts";
export default defineEventHandler(async (event) => {
  await handleGenerations(event.node.req, event.node.res, generations, () =>
    getReviewedProjects().revision(),
  );
});
