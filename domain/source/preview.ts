import { z } from "zod";
import {
  sourceDocumentSchema,
  sourcePlanEntrySchema,
  sourceResolutionSchema,
} from "./contracts.ts";

export const sourceInfoSchema = z.strictObject({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["upload", "folder"]),
  rootId: z.string().max(120).nullable().default(null),
  revision: z.number().int().nonnegative(),
  includeInterviews: z.boolean().default(true),
});
export const previewSchema = z.strictObject({
  resolutions: z.record(z.string(), sourceResolutionSchema).default({}),
  headingMatches: z
    .record(z.string(), z.record(z.string(), z.string()))
    .default({}),
  id: z.string().uuid(),
  source: sourceInfoSchema,
  revision: z.number().int().nonnegative(),
  entries: z.array(sourcePlanEntrySchema).max(400),
  createdAt: z.string(),
  status: z.enum(["pending", "applied", "discarded"]),
  appliedRevision: z.number().int().nonnegative().optional(),
});
export type SourceInfo = z.infer<typeof sourceInfoSchema>;
export type SourcePreview = z.infer<typeof previewSchema>;
export const acceptedSourceSchema = sourceInfoSchema.extend({
  documents: z.array(sourceDocumentSchema),
});
export type AcceptedSource = z.infer<typeof acceptedSourceSchema>;
export const acceptSourceSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  resolutions: z.record(z.string(), sourceResolutionSchema),
  headingMatches: z
    .record(z.string(), z.record(z.string(), z.string()))
    .default({}),
});
export type AcceptSource = z.input<typeof acceptSourceSchema>;
