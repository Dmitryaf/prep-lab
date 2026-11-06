import { createError, defineEventHandler } from "nuxt/server";
import { readKnowledge } from "#server/application/knowledge.ts";
import { readBundledKnowledge } from "#server/infrastructure/knowledge/bundled.ts";
import { sourceKnowledge } from "#domain/source/knowledge.ts";
import {
  getSources,
  getAnalysisRepository,
} from "#server/infrastructure/storage/runtime.ts";

export default defineEventHandler(async () => {
  try {
    return getAnalysisRepository().knowledge(
      sourceKnowledge(
        await readKnowledge({ common: readBundledKnowledge }),
        getSources().snapshot().sources,
      ),
    );
  } catch {
    throw createError({
      status: 503,
      message: "База знаний недоступна. Проверьте подключённый источник.",
    });
  }
});
