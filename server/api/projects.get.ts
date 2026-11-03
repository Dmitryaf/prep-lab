import { createError, defineEventHandler } from "nuxt/server";
import { readProjectCatalog } from "../infrastructure/projects/catalog.ts";
export default defineEventHandler(() => {
  try {
    return readProjectCatalog();
  } catch {
    throw createError({
      status: 503,
      message: "Личные проекты недоступны. Исходный пакет сохранён.",
    });
  }
});
