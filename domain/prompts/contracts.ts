import { z } from "zod";
import { documentInputSchema } from "#domain/source/contracts.ts";
export const promptIdSchema = z.enum(["import", "project", "discussion"]);
export type PromptId = z.infer<typeof promptIdSchema>;
export const promptTemplateSchema = z.strictObject({
  id: promptIdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(1),
  purpose: z.string().min(1),
  resultVersion: z.literal("1"),
  text: z.string().min(1).max(20000),
});
export type PromptTemplate = z.infer<typeof promptTemplateSchema>;
export const promptInputSchema = z
  .strictObject({
    profile: z.enum(["vue", "react"]),
    request: z.string().min(1).max(10000),
    context: z.string().max(20000),
    materials: z
      .array(
        z.strictObject({
          id: z.string().min(1).max(2048),
          path: z.string().max(1024),
          text: z.string().max(100000),
        }),
      )
      .max(30),
  })
  .refine(
    (value) =>
      value.materials.reduce(
        (size, item) => size + item.text.length,
        value.context.length + value.request.length,
      ) <= 250000,
    "Контекст слишком большой.",
  );
export type PromptInput = z.infer<typeof promptInputSchema>;
export const importDraftSchema = z.strictObject({
  schemaVersion: z.literal(1),
  documents: z.array(documentInputSchema).min(1).max(200),
});
export const promptSaveSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  baseVersion: z.string(),
  text: z.string().trim().min(1).max(20000).nullable(),
});
export const promptStateSchema = z.object({
  template: promptTemplateSchema,
  text: z.string(),
  revision: z.number().int().nonnegative(),
  customized: z.boolean(),
  needsReview: z.boolean(),
  previousBase: z.string(),
});
