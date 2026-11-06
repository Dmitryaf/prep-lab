import { useStorage } from "nitropack/runtime";
import { z } from "zod";
import { promptTemplateSchema } from "#domain/prompts/contracts.ts";
export async function readBundledPrompts() {
  const storage = useStorage("assets:prompts");
  const raw = await storage.getItem<string>("manifest.json");
  const manifest = z
    .array(promptTemplateSchema.omit({ text: true }))
    .parse(typeof raw === "string" ? JSON.parse(raw) : raw);
  return Promise.all(
    manifest.map(async (template) =>
      promptTemplateSchema.parse({
        ...template,
        text: await storage.getItem<string>(`${template.id}.md`),
      }),
    ),
  );
}
