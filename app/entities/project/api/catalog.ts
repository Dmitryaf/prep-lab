import { projectCatalogSchema } from "../../../../domain/projects/catalog.ts";

export async function getProjectCatalog() {
  const response = await fetch("/api/projects");
  if (!response.ok)
    throw new Error(
      "Личные проекты недоступны. Проверьте пакет материалов экземпляра.",
    );
  const result = projectCatalogSchema.safeParse(await response.json());
  if (!result.success)
    throw new Error(
      "Пакет проектов не прошёл проверку. Исходные файлы сохранены.",
    );
  return result.data;
}
