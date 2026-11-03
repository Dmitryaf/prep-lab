import { parseDocument } from "yaml";
import { z } from "zod";
import { stripFrontmatter } from "../knowledge/markdown.ts";

export interface SourceMetadata {
  title: string;
  aliases: string[];
  warnings: string[];
  profile?: "shared" | "vue" | "react";
  kind?: "reference" | "theory" | "practice" | "design" | "behavioral";
  category?: string;
}
const metadataSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  aliases: z
    .union([z.string().max(300), z.array(z.string().max(300)).max(100)])
    .optional(),
  frontendLab: z
    .object({
      profile: z.enum(["shared", "vue", "react"]).optional(),
      kind: z
        .enum(["reference", "theory", "practice", "design", "behavioral"])
        .optional(),
      category: z.string().trim().min(1).max(120).optional(),
    })
    .optional(),
});
export function sourceMetadata(markdown: string, path: string): SourceMetadata {
  const body = stripFrontmatter(markdown);
  const fallback =
    /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ||
    path.split("/").at(-1)!.replace(/\.md$/i, "");
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
    markdown,
  )?.[1];
  if (frontmatter === undefined)
    return { title: fallback, aliases: [], warnings: [] };
  try {
    if (frontmatter.length > 32_000)
      throw new Error("Metadata exceeds its limit.");
    const document = parseDocument(frontmatter, {
      schema: "core",
      version: "1.2",
      uniqueKeys: true,
    });
    if (document.errors.length || document.warnings.length)
      throw new Error("Unsupported YAML metadata.");
    const parsed = metadataSchema.parse(
      document.toJS({ maxAliasCount: 100 }) || {},
    );
    const aliases =
      typeof parsed.aliases === "string"
        ? [parsed.aliases]
        : parsed.aliases || [];
    return {
      title: parsed.title || fallback,
      aliases: [
        ...new Set(aliases.map((alias) => alias.trim()).filter(Boolean)),
      ],
      ...parsed.frontendLab,
      warnings: [],
    };
  } catch {
    return {
      title: fallback,
      aliases: [],
      warnings: [
        "Метаданные файла не распознаны; текст сохранён без изменений: " + path,
      ],
    };
  }
}
