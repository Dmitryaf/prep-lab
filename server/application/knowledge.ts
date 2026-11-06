import { loadKnowledge } from "#server/infrastructure/knowledge/folder.ts";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { ownerPackagePath } from "#server/infrastructure/projects/catalog.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { withBundledRounds } from "#domain/knowledge/bundled-rounds.ts";
import { refreshLegacyHr } from "#server/infrastructure/knowledge/hr-presentation.ts";

export async function readKnowledge({
  knowledgeRoot = process.env.CAREER_KNOWLEDGE_ROOT,
  projectPackageRoot = ownerPackagePath(),
  common = loadCommonKnowledge,
}: {
  knowledgeRoot?: string;
  projectPackageRoot?: string | null;
  common?: () => Knowledge | Promise<Knowledge>;
} = {}) {
  const shared = await common();
  const withProfiles = (knowledge: Knowledge) =>
    withBundledRounds(refreshLegacyHr(knowledge, shared), shared);
  if (knowledgeRoot) return withProfiles(loadKnowledge(knowledgeRoot));
  if (projectPackageRoot !== null) {
    let present = false;
    try {
      const entry = lstatSync(projectPackageRoot);
      if (entry.isSymbolicLink() || !entry.isDirectory())
        throw new Error("Пакет материалов не является обычной папкой.");
      present = true;
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    if (present)
      return withProfiles(loadKnowledge(join(projectPackageRoot, "knowledge")));
  }
  return shared;
}
