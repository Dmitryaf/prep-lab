import { composePrompt } from "../../domain/prompts/compose.ts";
import type { PromptTemplate } from "../../domain/prompts/contracts.ts";
import type { PromptRepository } from "../infrastructure/storage/prompts.ts";
export function discussionPrompt(
  templates: () => Promise<PromptTemplate[]>,
  prompts: () => PromptRepository,
  profile: () => "vue" | "react",
) {
  return async (context: string, message: string) => {
    const template = (await templates()).find(
      (template) => template.id === "discussion",
    );
    if (!template) throw new Error("Шаблон обсуждения недоступен.");
    return composePrompt(template, prompts().read(template).text, {
      profile: profile(),
      request: message,
      context:
        "История разговора передаётся отдельно. Она не является подтверждением фактов о пользователе.",
      materials: [
        { id: "current-material", path: "Текущий материал", text: context },
      ],
    });
  };
}
