import { z } from "zod";
import { projectDraftSchema } from "#domain/projects/draft.ts";
import { analysisInputSchema } from "./input.ts";

export const analysisRequestSchema = analysisInputSchema.extend({
  profile: z.enum(["vue", "react"]),
  context: z.string().max(20_000).default(""),
  connectionId: z.string().uuid().optional(),
});
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export const analysisChangeSchema = z.object({
  id: z.string(),
  action: z.enum(["add", "update", "skip", "conflict"]),
  title: z.string().min(1).max(200),
  before: z.string().max(500_000),
  after: z.string().max(500_000),
  reason: z.string().max(2000),
  targetId: z.string().optional(),
});
export type AnalysisChange = z.infer<typeof analysisChangeSchema>;
export const analysisJobSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  scenario: z.enum(["project", "import"]),
  profile: z.enum(["vue", "react"]),
  status: z.enum([
    "running",
    "ready",
    "accepted",
    "failed",
    "cancelled",
    "unchanged",
  ]),
  stage: z.string(),
  completed: z.number(),
  total: z.number(),
  name: z.string(),
  roots: z.array(z.string()),
  filesCount: z.number(),
  warnings: z.array(z.string()),
  summary: z.string(),
  error: z.string(),
  changes: z.array(analysisChangeSchema),
  projectDraft: projectDraftSchema.nullable().optional(),
  projectId: z.string().optional(),
  createdAt: z.string(),
  changedFileCount: z.number(),
});
export type AnalysisJob = z.infer<typeof analysisJobSchema>;

export interface AnalysisMaterial {
  id: string;
  path: string;
  text: string;
}
export interface AnalysisInventory {
  path: string;
  size: number;
  hash: string;
}
export interface AnalysisRecord {
  job: AnalysisJob;
  revision: number;
  context: string;
  fingerprint: string;
  knowledgeFingerprint?: string;
  materials: AnalysisMaterial[];
  inventory: AnalysisInventory[];
  observations: Record<string, string>;
}
