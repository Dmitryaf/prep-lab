import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import { loadKnowledge } from "./folder.ts";

export const privateNoteSchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(2048)
    .refine(
      (path) =>
        path.endsWith(".md") &&
        !/[:\\]/.test(path) &&
        !path.includes("\0") &&
        path
          .split("/")
          .every((part) => part.length > 0 && !part.startsWith(".")),
    ),
  title: z.string().min(1).max(500).optional(),
  aliases: z.array(z.string()).optional(),
  headingAliases: z.record(z.string(), z.string()).optional(),
});
export type PrivateNote = z.infer<typeof privateNoteSchema>;

function privateMetadata(root: string, name: string): unknown {
  const path = join(resolve(root), name);
  try {
    const entry = lstatSync(path);
    const key = (value: string) =>
      process.platform === "win32" ? value.toLowerCase() : value;
    if (
      !entry.isFile() ||
      entry.size > 1_000_000 ||
      entry.isSymbolicLink() ||
      key(realpathSync(path)) !== key(path)
    )
      throw new Error(
        "Метаданные личных материалов должны быть обычным файлом.",
      );
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
    return [];
  }
}

export function loadRetainedBundledQuestions(root: string): string[] {
  return z
    .array(z.string().min(1).max(2048))
    .max(2000)
    .parse(privateMetadata(root, "retained-bundled-questions.json"));
}

// Optional metadata belongs to the configured personal vault, never bundled assets.
export function loadPrivateKnowledge(root: string) {
  const metadata = z
    .array(privateNoteSchema)
    .max(2000)
    .parse(privateMetadata(root, "private-notes.json"));
  if (new Set(metadata.map((note) => note.path)).size !== metadata.length)
    throw new Error("Повторяется путь личного материала.");
  return loadKnowledge(root, metadata);
}
