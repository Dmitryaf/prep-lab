import { z } from "zod";
export const projectDraftSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(160),
  summary: z.string().min(1).max(3000),
  stack: z.array(z.string().min(1).max(100)).max(40).optional(),
  map: z
    .strictObject({
      nodes: z
        .array(
          z.strictObject({
            id: z.string().min(1).max(120),
            label: z.string().min(1).max(200),
            kind: z.enum(["scenario", "module", "technology", "system"]),
            description: z.string().max(4000),
            topicIndexes: z.array(z.number().int().nonnegative()).max(80),
          }),
        )
        .min(1)
        .max(100),
      edges: z
        .array(
          z.strictObject({
            from: z.string(),
            to: z.string(),
            label: z.string().min(1).max(200),
            kind: z.enum(["flow", "uses", "contains"]),
          }),
        )
        .max(250),
    })
    .optional(),
  roleFacts: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(2000),
        basis: z.enum(["user_statement", "document"]),
        sourceId: z.string().nullable(),
      }),
    )
    .max(40),
  unknowns: z.array(z.string().min(1).max(1000)).max(40),
  topics: z
    .array(
      z.strictObject({
        previousTopicId: z.string().optional(),
        title: z.string().min(1).max(200),
        explanation: z.string().min(1).max(6000),
        mechanism: z.array(z.string().max(1500)).min(1).max(12),
        tradeoff: z.string().min(1).max(3000),
        questions: z
          .array(
            z.strictObject({
              question: z.string().min(1).max(1200),
              previousQuestionId: z.string().optional(),
              answer: z.string().min(1).max(6000),
              criteria: z.string().min(1).max(3000),
            }),
          )
          .min(1)
          .max(10),
        codeReferences: z
          .array(
            z.strictObject({
              sourceId: z.string(),
              startLine: z.number().int().positive(),
              endLine: z.number().int().positive(),
              explanation: z.string().min(1).max(2000),
            }),
          )
          .max(20),
      }),
    )
    .min(1)
    .max(80),
});
export type ProjectDraft = z.infer<typeof projectDraftSchema>;
