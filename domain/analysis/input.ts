import { z } from "zod";

export const analysisInputLimits = {
  roots: 8,
  files: 2000,
  entries: 30000,
  fileBytes: 1_000_000,
  totalBytes: 12_000_000,
  archiveBytes: 12_000_000,
} as const;

export const analysisUploadSchema = z.strictObject({
  path: z.string().min(1).max(1024),
  encoding: z.literal("base64"),
  content: z.string().max(16_000_000),
});
export const analysisInputSchema = z.strictObject({
  scenario: z.enum(["project", "import"]),
  paths: z
    .array(z.string().trim().min(1).max(4096))
    .max(analysisInputLimits.roots)
    .default([]),
  files: z
    .array(analysisUploadSchema)
    .max(analysisInputLimits.files, "Превышен лимит количества файлов.")
    .default([]),
});
export type AnalysisInput = z.input<typeof analysisInputSchema>;
export interface AnalysisMaterial {
  id: string;
  path: string;
  text: string;
}
export interface AnalysisInventoryEntry {
  path: string;
  size: number;
  hash: string;
}
export interface AnalysisInputResult {
  materials: AnalysisMaterial[];
  inventory: AnalysisInventoryEntry[];
  roots: string[];
  warnings: string[];
  fingerprint: string;
}

const excludedDirectories = new Set([
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  "artifacts",
  "credentials",
  "secrets",
  "__pycache__",
  "venv",
  "logs",
]);
const projectExtensions = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".json",
  ".yaml",
  ".yml",
  ".graphql",
  ".gql",
  ".sql",
  ".cs",
  ".go",
  ".py",
  ".java",
  ".kt",
  ".rs",
  ".rb",
  ".php",
]);
const ignoredNames =
  /^(?:AGENTS(?:\.override)?|CLAUDE|SKILL)\.md$|^(?:credentials|secrets|tokens?|auth|service[-_]?account)(?:[.-].*)?\.(?:json|ya?ml|txt)$|^(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|poetry\.lock|cargo\.lock)$/i;

export function isExcludedAnalysisPath(path: string) {
  const parts = path.replaceAll("\\", "/").split("/");
  return (
    parts.some(
      (part) =>
        part.startsWith(".") || excludedDirectories.has(part.toLowerCase()),
    ) || ignoredNames.test(parts.at(-1) || "")
  );
}
export function includeAnalysisPath(
  path: string,
  scenario: AnalysisInput["scenario"],
) {
  if (isExcludedAnalysisPath(path)) return false;
  const name = path.replaceAll("\\", "/").split("/").at(-1) || "";
  const extension = name.includes(".")
    ? name.slice(name.lastIndexOf(".")).toLowerCase()
    : "";
  return scenario === "import"
    ? [".md", ".mdx", ".txt"].includes(extension)
    : projectExtensions.has(extension) ||
        /^(?:Dockerfile|Makefile)$/i.test(name);
}
