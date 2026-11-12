import { composePrompt } from "#domain/prompts/compose.ts";
import type { PromptTemplate } from "#domain/prompts/contracts.ts";
import type { PromptInput } from "#domain/prompts/contracts.ts";
import type { PromptRepository } from "#server/infrastructure/storage/prompts.ts";
export function discussionPrompt(
  templates: () => Promise<PromptTemplate[]>,
  prompts: () => PromptRepository,
  profile: () => "vue" | "react",
  projectContext?: (
    context: string,
    message: string,
  ) => Promise<PromptInput["materials"]>,
) {
  return async (
    context: string,
    message: string,
    materialKey = "",
    discussionMode?: "discussion" | "hint",
  ) => {
    const template = (await templates()).find(
      (template) => template.id === "discussion",
    );
    if (!template) throw new Error("Шаблон обсуждения недоступен.");
    const mode =
      discussionMode ??
      (materialKey.startsWith("question-hint:") ||
      materialKey.startsWith("interview-hint:")
        ? "hint"
        : "discussion");
    return composePrompt(
      template,
      prompts().read(template).text,
      {
        profile: profile(),
        request: message,
        context:
          "История разговора передаётся отдельно. Учитывай факты, сообщённые пользователем. Не выводи его личный вклад из одного лишь наличия кода.",
        materials: [
          { id: "current-material", path: "Текущий материал", text: context },
          ...((await projectContext?.(context, message)) || []),
        ],
      },
      mode,
    );
  };
}
