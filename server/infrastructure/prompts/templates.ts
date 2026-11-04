import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { promptTemplateSchema } from "../../../domain/prompts/contracts.ts";
export function readPromptTemplates() {
  const manifest = z
    .array(promptTemplateSchema.omit({ text: true }))
    .parse(
      JSON.parse(
        readFileSync(resolve("content/prompts/manifest.json"), "utf8"),
      ),
    );
  return manifest.map((template) =>
    promptTemplateSchema.parse({
      ...template,
      text: readFileSync(resolve(`content/prompts/${template.id}.md`), "utf8"),
    }),
  );
}
