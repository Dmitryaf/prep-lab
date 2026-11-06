import { z } from "zod";
import {
  promptStateSchema,
  type PromptId,
  type PromptInput,
} from "#domain/prompts/contracts.ts";

export type PromptState = z.infer<typeof promptStateSchema>;
async function request(path: string, body?: unknown) {
  const response = await fetch("/api/prompts" + path, {
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
      typeof result.error === "string" ? result.error : "Промпты недоступны.",
    );
  return result;
}
export async function readPrompts() {
  return z
    .object({ prompts: z.array(promptStateSchema) })
    .parse(await request(""));
}
export async function savePrompt(state: PromptState, text: string | null) {
  return promptStateSchema.parse(
    await request(`/${state.template.id}/save`, {
      revision: state.revision,
      baseVersion: state.template.version,
      text,
    }),
  );
}
export async function previewPrompt(
  id: PromptId,
  text: string,
  input: PromptInput,
) {
  return z
    .object({
      prompt: z.string(),
      templateId: z.string(),
      templateVersion: z.string(),
      resultVersion: z.string(),
    })
    .parse(await request(`/${id}/preview`, { text, input }));
}
