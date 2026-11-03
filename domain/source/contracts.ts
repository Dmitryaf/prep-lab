import { z } from "zod";

const excluded = new Set([
  "node_modules",
  "labs",
  "_archive",
  "_meta",
  "dist",
  "coverage",
]);
// eslint-disable-next-line no-control-regex -- Reject control characters and nonportable path characters.
const unsafePathCharacters = /[\\:\x00-\x1f<>"|?*]/;
export const markdownPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((path) => {
    const parts = path.split("/");
    return (
      /\.md$/i.test(path) &&
      !unsafePathCharacters.test(path) &&
      parts.length <= 32 &&
      parts.every(
        (part) =>
          !!part &&
          !part.startsWith(".") &&
          !/[. ]$/.test(part) &&
          !excluded.has(part.toLowerCase()) &&
          !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) &&
          !/^(?:AGENTS(?:\.override)?|CLAUDE|SKILL)\.md$/i.test(part),
      )
    );
  }, "Ожидается относительный путь к разрешённому Markdown-файлу.");
export const documentInputSchema = z.strictObject({
  path: markdownPathSchema,
  markdown: z.string().max(1_000_000),
  kind: z
    .enum(["reference", "theory", "practice", "design", "behavioral"])
    .default("theory"),
  profile: z.enum(["shared", "vue", "react"]).default("shared"),
});
export type SourceDocumentInput = z.infer<typeof documentInputSchema>;
export const sourceDocumentSchema = documentInputSchema
  .omit({ markdown: true })
  .extend({
    id: z.string().min(1).max(2048),
    sourceId: z.string().min(1).max(120),
    sourceMarkdown: z.string().max(1_000_000).nullable(),
    markdown: z.string().max(1_000_000).nullable(),
    aliases: z.array(markdownPathSchema),
    questionKeys: z.record(z.string(), z.string()),
    headingAliases: z.record(z.string(), z.string()).optional(),
  });
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
const text = z.string().max(1_000_000).nullable();
export const sourcePlanEntrySchema = sourceDocumentSchema
  .omit({ sourceMarkdown: true, markdown: true })
  .extend({
    baseline: text,
    current: text,
    incoming: text,
    proposed: text.optional(),
    previousPath: markdownPathSchema.optional(),
    status: z.enum([
      "added",
      "updated",
      "renamed",
      "removed",
      "conflict",
      "unchanged",
    ]),
  })
  .superRefine((entry, context) => {
    if ((entry.status === "conflict") === (entry.proposed !== undefined))
      context.addIssue({
        code: "custom",
        message: "Предложение не соответствует состоянию конфликта.",
      });
  });
export type SourcePlanEntry = z.infer<typeof sourcePlanEntrySchema>;
export const sourceResolutionSchema = z.discriminatedUnion("choice", [
  z.strictObject({ choice: z.literal("current") }),
  z.strictObject({ choice: z.literal("incoming") }),
  z.strictObject({ choice: z.literal("remove") }),
  z.strictObject({
    choice: z.literal("edited"),
    markdown: z.string().max(1_000_000),
  }),
]);
export type SourceResolution = z.infer<typeof sourceResolutionSchema>;
