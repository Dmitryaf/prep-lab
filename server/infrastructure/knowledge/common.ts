import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { bundledManifestSchema } from "#domain/knowledge/contracts.ts";
import { loadKnowledge } from "./folder.ts";

export function loadCommonKnowledge(root = resolve("content/common")) {
  const manifest = bundledManifestSchema.parse(
    JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")),
  );
  return { ...loadKnowledge(root), profiles: manifest.profiles };
}
