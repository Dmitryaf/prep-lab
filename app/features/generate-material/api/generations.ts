import { z } from "zod";
import {
  importDraftSchema,
  promptInputSchema,
  type PromptInput,
} from "#domain/prompts/contracts.ts";
import { projectDraftSchema } from "#domain/projects/draft.ts";
export const generationStatusSchema = z.enum([
  "pending",
  "completed",
  "failed",
  "interrupted",
  "accepted",
]);
export const generationScenarioSchema = z.enum(["import", "project"]);
export const generationDraftSchema = z.union([
  importDraftSchema,
  projectDraftSchema,
]);
export type GenerationDraft = z.infer<typeof generationDraftSchema>;
export type GenerationScenario = z.infer<typeof generationScenarioSchema>;
const jobSummarySchema = z.object({
  id: z.string(),
  scenario: generationScenarioSchema,
  status: generationStatusSchema,
  createdAt: z.string(),
  request: z.string(),
});
export const generationJobSchema = z.object({
  id: z.string(),
  scenario: generationScenarioSchema,
  status: generationStatusSchema,
  createdAt: z.string(),
  revision: z.number().int().nonnegative(),
  input: promptInputSchema,
  prompt: z.string(),
  raw: z.string(),
  draft: generationDraftSchema.nullable(),
  error: z.string(),
  previewId: z.string().optional(),
  projectId: z.string().optional(),
});
export type GenerationJob = z.infer<typeof generationJobSchema>;
export type JobSummary = z.infer<typeof jobSummarySchema>;
async function request(path: string, body?: unknown) {
  const response = await fetch("/api/generations" + path, {
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Не удалось прочитать задание.",
    );
  return result;
}
export const listGenerations = async () =>
  z
    .object({ jobs: z.array(jobSummarySchema), revision: z.number() })
    .parse(await request(""));
export const readGeneration = async (id: string) =>
  generationJobSchema.parse(await request("/" + encodeURIComponent(id)));
export const cancelGeneration = (id: string) =>
  request("/" + encodeURIComponent(id) + "/cancel", {});
export const acceptGeneration = async (
  id: string,
  revision: number,
  draft: GenerationDraft,
) =>
  z
    .object({
      previewId: z.string().optional(),
      projectId: z.string().optional(),
    })
    .parse(
      await request("/" + encodeURIComponent(id) + "/accept", {
        revision,
        draft,
      }),
    );
export async function previewGeneration(
  scenario: GenerationScenario,
  input: PromptInput,
) {
  const response = await fetch(`/api/prompts/${scenario}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Не удалось подготовить задание.",
    );
  return z.object({ prompt: z.string() }).parse(result).prompt;
}
const eventSchema = z.union([
  z.strictObject({ id: z.string() }),
  z.strictObject({ delta: z.string() }),
  z.strictObject({ done: z.literal(true) }),
  z.strictObject({ error: z.string() }),
]);
export type GenerationEvent = z.infer<typeof eventSchema>;
export async function readGenerationStream(
  response: Response,
  onEvent: (event: GenerationEvent) => void,
) {
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : "Не удалось запустить подготовку черновика.",
    );
  }
  if (!response.body) throw new Error("Поток ответа недоступен.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "",
    done = false,
    size = 0;
  function consume(line: string) {
    if (!line.trim()) return;
    if (done)
      throw new Error("После завершения пришли данные неверного формата.");
    let event: GenerationEvent;
    try {
      event = eventSchema.parse(JSON.parse(line));
    } catch {
      throw new Error("Сервер вернул ответ неверного формата.");
    }
    onEvent(event);
    if ("error" in event) throw new Error(event.error);
    if ("done" in event) done = true;
  }
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 2_000_000)
        throw new Error("Ответ превысил допустимый размер.");
      pending += decoder.decode(part.value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        consume(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    }
    pending += decoder.decode();
    consume(pending);
    if (!done)
      throw new Error(
        "Связь прервалась. Обновите результат, чтобы проверить сохранённое состояние.",
      );
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
export function startGeneration(
  scenario: GenerationScenario,
  input: PromptInput,
  expectedPrompt: string,
  signal: AbortSignal,
) {
  return fetch("/api/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, input, expectedPrompt }),
    signal,
  });
}
