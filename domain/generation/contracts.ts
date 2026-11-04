import { z } from "zod";
import { promptInputSchema, importDraftSchema } from "../prompts/contracts.ts";
import { projectDraftSchema } from "../projects/draft.ts";
export const scenarioSchema = z.enum(["import", "project"]);
export const generationSchema = z.strictObject({
  id: z.string().uuid(),
  scenario: scenarioSchema,
  status: z.enum(["pending", "completed", "failed", "interrupted", "accepted"]),
  createdAt: z.string(),
  revision: z.number().int().nonnegative(),
  input: promptInputSchema,
  prompt: z.string().max(600000),
  raw: z.string().max(250000),
  draft: z.union([importDraftSchema, projectDraftSchema]).nullable(),
  error: z.string(),
  previewId: z.string().optional(),
  projectId: z.string().optional(),
});
export type Generation = z.infer<typeof generationSchema>;
export type GenerationEvent = {
  id?: string;
  delta?: string;
  done?: boolean;
  error?: string;
};
