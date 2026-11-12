import { useStorage } from "nitropack/runtime";
import { z } from "zod";
import {
  applyBundledManifest,
  compileKnowledge,
} from "#domain/knowledge/catalog.ts";
import { categoryFor } from "#domain/knowledge/markdown.ts";
import type { Note } from "#domain/knowledge/material.ts";
import { bundledManifestSchema } from "#domain/knowledge/contracts.ts";

export async function readBundledKnowledge() {
  const storage = useStorage("assets:knowledge");
  const manifest = bundledManifestSchema.parse(
    await storage.getItem("manifest.json"),
  );
  const notes = await Promise.all(
    manifest.paths.map(async (path): Promise<Note> => {
      const markdown = z.string().parse(await storage.getItem(path));
      const title =
        /^title:\s*["']?(.+?)["']?\s*$/m.exec(markdown)?.[1] ||
        /^# (.+)$/m.exec(markdown)?.[1] ||
        path.split("/").at(-1)!.replace(/\.md$/, "");
      return {
        id: path.replace(/\.md$/, ""),
        path,
        title,
        markdown,
        category: categoryFor(path),
      };
    }),
  );
  return applyBundledManifest(compileKnowledge(notes), manifest);
}
