import {
  loadPrivateKnowledge,
  loadRetainedBundledQuestions,
} from "#server/infrastructure/knowledge/private.ts";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { ownerPackagePath } from "#server/infrastructure/projects/catalog.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { withBundledRounds } from "#domain/knowledge/bundled-rounds.ts";

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
  const withProfiles = (root: string) =>
    withBundledRounds(
      loadPrivateKnowledge(root),
      shared,
      loadRetainedBundledQuestions(root),
    );
  if (knowledgeRoot) return withProfiles(knowledgeRoot);
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
    if (present) return withProfiles(join(projectPackageRoot, "knowledge"));
  }
  return shared;
}
