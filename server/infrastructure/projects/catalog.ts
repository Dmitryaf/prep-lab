import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  projectCatalogSchema,
  emptyProjectCatalog,
} from "#domain/projects/catalog.ts";

export const ownerPackagePath = () =>
  resolve(
    process.env.FRONTEND_LAB_DATA_DIR || ".local",
    "instance/owner-package",
  );
export function readProjectCatalog(
  directory: string | null = ownerPackagePath(),
) {
  if (directory === null) return emptyProjectCatalog();
  try {
    lstatSync(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return emptyProjectCatalog();
    throw error;
  }
  const path = join(directory, "projects.json");
  const normalize = (value: string) =>
    process.platform === "win32" ? value.toLowerCase() : value;
  if (
    lstatSync(directory).isSymbolicLink() ||
    normalize(realpathSync(directory)) !== normalize(resolve(directory)) ||
    lstatSync(path).isSymbolicLink()
  )
    throw new Error("Ссылка вместо приватного пакета не разрешена.");
  return projectCatalogSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
