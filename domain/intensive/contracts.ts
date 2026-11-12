import { z } from "zod";
import { preparedQuestionSchema } from "#domain/knowledge/contracts.ts";
import type { PreparedQuestion } from "#domain/knowledge/question.ts";

const intensiveQuestionSchema: z.ZodType<PreparedQuestion> =
  preparedQuestionSchema;

const ids = z
  .array(z.string().min(1))
  .refine(
    (values) => new Set(values).size === values.length,
    "Повторяющиеся материалы.",
  );
export const intensiveGoalSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    direction: z.string().trim().max(500).optional(),
    vacancy: z.string().max(30_000).optional(),
    interviewDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    noteIds: ids,
    projectIds: ids,
  })
  .refine(
    (goal) => goal.noteIds.length + goal.projectIds.length > 0,
    "Выберите материалы или проекты.",
  );
export const intensiveLessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["material", "project"]),
  noteId: z.string().optional(),
  projectId: z.string().optional(),
  topicId: z.string().optional(),
  reading: z.object({
    title: z.string(),
    markdown: z.string(),
    href: z.string(),
  }),
  questions: z.array(intensiveQuestionSchema),
});
export const intensiveProgramSchema = z.object({
  id: z.string().min(1),
  goal: intensiveGoalSchema,
  lessons: z
    .array(intensiveLessonSchema)
    .min(1)
    .refine(
      (lessons) =>
        new Set(lessons.map((lesson) => lesson.id)).size === lessons.length,
      "Повторяющиеся занятия.",
    ),
  createdAt: z.string(),
  hiddenLessonIds: ids.optional(),
});
export const intensiveAssessmentSchema = z.object({
  level: z.enum(["gap", "assisted", "independent"]),
  note: z.string().max(10_000),
});
export const intensiveStorySchema = z.object({
  purpose: z.string().max(30_000),
  scenario: z.string().max(30_000),
  structure: z.string().max(30_000),
  contribution: z.string().max(30_000),
  decisions: z.string().max(30_000),
  constraints: z.string().max(30_000),
  result: z.string().max(30_000),
});
export const intensiveProgressInputSchema = z.object({
  status: z.enum(["pending", "in-progress", "done"]),
  drafts: z.record(z.string(), z.string().max(100_000)),
  notes: z.string().max(100_000),
  questionId: z.string().optional(),
  step: z
    .enum(["answer", "reading", "practice", "check", "result"])
    .default("answer"),
  outcome: z
    .enum(["read", "gap", "assisted", "independent", "applied"])
    .optional(),
  assessments: z.record(z.string(), intensiveAssessmentSchema).optional(),
  checks: z.record(z.string(), z.string().max(100_000)).optional(),
});
export const intensiveProgressSchema = intensiveProgressInputSchema.extend({
  updatedAt: z.string(),
});
export const intensiveStateSchema = z.object({
  version: z.literal(1),
  plan: intensiveProgramSchema.nullable(),
  draft: intensiveProgramSchema.nullable(),
  progress: z.record(z.string(), intensiveProgressSchema),
  stories: z.record(z.string(), intensiveStorySchema).optional(),
  tomorrow: z.array(
    z.object({
      id: z.string().min(1),
      lessonId: z.string().min(1),
      text: z.string().trim().min(1).max(10_000),
      done: z.boolean(),
    }),
  ),
});
export const intensiveSnapshotSchema = z.object({
  state: intensiveStateSchema,
  revision: z.int().nonnegative(),
});
export const intensiveRevisionSchema = z.int().nonnegative();
export const intensiveLessonIdsSchema = ids.min(1);
export type IntensiveGoal = z.infer<typeof intensiveGoalSchema>;
export type IntensiveLesson = z.infer<typeof intensiveLessonSchema>;
export type IntensiveProgram = z.infer<typeof intensiveProgramSchema>;
export type IntensiveProgress = z.infer<typeof intensiveProgressSchema>;
export type IntensiveState = z.infer<typeof intensiveStateSchema>;
export type IntensiveSnapshot = z.infer<typeof intensiveSnapshotSchema>;
export type IntensiveStory = z.infer<typeof intensiveStorySchema>;
export interface IntensiveCatalog {
  notes: {
    id: string;
    title: string;
    category: string;
    questionCount: number;
  }[];
  projects: { id: string; name: string; stack: string[]; topicCount: number }[];
  topics?: { id: string; projectId: string; title: string; group: string }[];
}
export const emptyIntensiveState = (): IntensiveState => ({
  version: 1,
  plan: null,
  draft: null,
  progress: {},
  tomorrow: [],
});
