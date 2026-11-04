import { createError, defineEventHandler } from "nuxt/server";
import { readProjectCatalog } from "../infrastructure/projects/catalog.ts";
import { getReviewedProjects } from "../infrastructure/storage/runtime.ts";
export default defineEventHandler(() => {
  try {
    return getReviewedProjects().catalog(readProjectCatalog());
  } catch {
    throw createError({
      status: 503,
      message: "Личные проекты недоступны. Исходный пакет сохранён.",
    });
  }
});
