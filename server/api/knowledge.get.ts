import { createError, defineEventHandler } from "nuxt/server";
import { readKnowledge } from "../application/knowledge.ts";
import { readBundledKnowledge } from "../infrastructure/knowledge/bundled.ts";
import { sourceKnowledge } from "../../domain/source/knowledge.ts";
import { getSources } from "../infrastructure/storage/runtime.ts";

export default defineEventHandler(async () => {
  try {
    return sourceKnowledge(
      await readKnowledge({ common: readBundledKnowledge }),
      getSources().snapshot().sources,
    );
  } catch {
    throw createError({
      status: 503,
      message: "База знаний недоступна. Проверьте подключённый источник.",
    });
  }
});
