import type {
  SourcePlanEntry,
  SourceResolution,
  SourceDocument,
} from "./contracts.ts";
import { sourcePlanEntrySchema, sourceResolutionSchema } from "./contracts.ts";

export function resolveSourcePlan(
  plan: SourcePlanEntry[],
  resolutions: Record<string, SourceResolution>,
): SourceDocument[] {
  const entries = plan.map((entry) => sourcePlanEntrySchema.parse(entry));
  const ids = new Set(entries.map((entry) => entry.id));
  if (
    ids.size !== entries.length ||
    Object.keys(resolutions).some((id) => !ids.has(id))
  )
    throw new Error(
      "Разрешение относится к неизвестному или повторяющемуся материалу.",
    );
  return entries.map((entry) => {
    const resolution = Object.hasOwn(resolutions, entry.id)
      ? sourceResolutionSchema.parse(resolutions[entry.id])
      : undefined;
    if (entry.status === "conflict" && !resolution)
      throw new Error("Выберите, как разрешить конфликт: " + entry.path);
    const markdown =
      resolution?.choice === "current"
        ? entry.current
        : resolution?.choice === "incoming"
          ? entry.incoming
          : resolution?.choice === "remove"
            ? null
            : resolution?.choice === "edited"
              ? resolution.markdown
              : entry.proposed;
    if (markdown === undefined)
      throw new Error("Предложение изменения не завершено.");
    return {
      id: entry.id,
      sourceId: entry.sourceId,
      path: entry.path,
      kind: entry.kind,
      profile: entry.profile,
      sourceMarkdown: entry.incoming,
      markdown,
      aliases: [...entry.aliases],
      questionKeys: { ...entry.questionKeys },
      headingAliases: entry.headingAliases
        ? { ...entry.headingAliases }
        : undefined,
    };
  });
}
