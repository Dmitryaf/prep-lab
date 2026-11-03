import { createError, defineEventHandler } from "nuxt/server";
import { readKnowledge } from "../application/knowledge.ts";
import { readBundledKnowledge } from "../infrastructure/knowledge/bundled.ts";

export default defineEventHandler(async () => {
  try {
    return await readKnowledge({ common: readBundledKnowledge });
  } catch {
    throw createError({
      status: 503,
      message: "База знаний недоступна. Проверьте подключённый источник.",
    });
  }
});
