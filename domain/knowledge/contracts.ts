import { z } from "zod";

export const profileRoutesSchema = z.object({
  vue: z.array(z.string()),
  react: z.array(z.string()),
});
export const bundledManifestSchema = z.object({
  version: z.literal(1),
  paths: z.array(
    z
      .string()
      .refine(
        (path) =>
          path.endsWith(".md") &&
          !path.includes("\\") &&
          !path.split("/").some((part) => part.startsWith(".")),
      ),
  ),
  profiles: profileRoutesSchema,
});

const studyLink = z.object({
  profiles: z.array(z.enum(["vue", "react"])).optional(),
  kind: z.enum(["theory", "practice"]),
  noteId: z.string(),
  heading: z.string(),
  label: z.string(),
});
export const preparedQuestionSchema = z.looseObject({
  profiles: z.array(z.enum(["vue", "react"])).optional(),
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  answer: z.string(),
  kind: z.string(),
  source: z.string(),
  category: z.string(),
  availableAnswer: z.boolean().optional(),
  shortAnswer: z.string().optional(),
  criteria: z.string(),
  details: z.string().optional(),
  noteId: z.string().optional(),
  heading: z.string().optional(),
  topicId: z.string().optional(),
  project: z.string().optional(),
  projectGroup: z.string().optional(),
  parentId: z.string().optional(),
  curriculumTier: z.enum(["core", "extended", "vacancy"]).optional(),
  followups: z.array(z.string()),
  followupAnswers: z
    .array(z.object({ title: z.string(), answer: z.string() }))
    .optional(),
  learningLinks: z.array(studyLink),
});
export const knowledgeSchema = z.object({
  profiles: profileRoutesSchema.partial().optional(),
  notes: z.array(
    z.object({
      id: z.string(),
      path: z.string(),
      title: z.string(),
      markdown: z.string(),
      category: z.string(),
      sourceId: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      headingAliases: z.record(z.string(), z.string()).optional(),
      profiles: z.array(z.enum(["vue", "react"])).optional(),
    }),
  ),
  questions: z.array(preparedQuestionSchema),
  route: z.array(z.string()),
  warnings: z.array(z.string()),
});
