import { z } from "zod";
import type { Topic, Project } from "./types.ts";

const codeStep = z.looseObject({
  project: z.string(),
  path: z.string(),
  line: z.number(),
  symbol: z.string(),
  title: z.string(),
  explanation: z.string(),
});
const pilot = z.looseObject({
  id: z.string(),
  title: z.string(),
  sourceRevision: z.string().optional(),
  explanation: z.looseObject({
    intro: z.string(),
    steps: z.array(z.object({ title: z.string(), text: z.string() })),
    details: z.string().optional(),
  }),
  study: z.array(
    z.object({ path: z.string(), label: z.string(), why: z.string() }),
  ),
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      short: z.string(),
      detailed: z.array(z.string()),
      example: z.string(),
    }),
  ),
  code: z.looseObject({
    intro: z.string(),
    steps: z.array(codeStep),
    tests: z.array(codeStep),
    limitations: z.string().optional(),
  }),
});
export const topicSchema: z.ZodType<Topic> = z.looseObject({
  id: z.string(),
  project: z.string(),
  title: z.string(),
  group: z.string(),
  priority: z.string(),
  minutes: z.number(),
  summary: z.string(),
  context: z.string().optional(),
  mechanism: z.array(z.string()),
  decision: z.string().optional(),
  tradeoff: z.string(),
  question: z.string(),
  answer: z.string(),
  failures: z.array(z.string()).optional(),
  interview: z.array(z.string()).optional(),
  sources: z.array(z.tuple([z.string(), z.string()])),
  theory: z.array(z.tuple([z.string(), z.string()])),
  related: z.array(z.string()),
  pilot,
  story: z
    .object({
      short: z.string(),
      deep: z.array(z.string()),
      confirmed: z.string(),
      assumptions: z.string(),
      reconstruction: z.string(),
      boundaries: z.string(),
    })
    .optional(),
});
const project: z.ZodType<Project> = z.object({
  id: z.string(),
  name: z.string(),
  subtitle: z.string(),
  pitch: z.string(),
  icon: z.string(),
  repo: z.string(),
  branch: z.string(),
  color: z.string(),
  stack: z.array(z.string()),
  routes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      caption: z.string(),
      nodes: z.array(z.string()),
    }),
  ),
});
export const projectsSchema = z.record(z.string(), project);
