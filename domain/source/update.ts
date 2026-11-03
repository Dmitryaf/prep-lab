import type {
  SourceDocumentInput,
  SourceDocument,
  SourcePlanEntry,
} from "./contracts.ts";
import { documentInputSchema, sourceDocumentSchema } from "./contracts.ts";
import { reconcileText } from "./reconcile.ts";

export function planSourceUpdate(
  sourceId: string,
  previous: SourceDocument[],
  incoming: SourceDocumentInput[],
  makeId: () => string,
  matches: Record<string, string> = {},
): SourcePlanEntry[] {
  const pathKey = (path: string) => path.normalize("NFC").toLowerCase();
  previous = previous.map((document) => sourceDocumentSchema.parse(document));
  if (previous.some((document) => document.sourceId !== sourceId))
    throw new Error("Материал относится к другому источнику.");
  incoming = incoming.map((document) => documentInputSchema.parse(document));
  const paths = new Set<string>();
  for (const document of incoming) {
    const key = pathKey(document.path);
    if (paths.has(key))
      throw new Error("Повторяется путь файла: " + document.path);
    paths.add(key);
  }
  const reserved = new Set<string>();
  for (const [path, id] of Object.entries(matches)) {
    if (
      !incoming.some((document) => document.path === path) ||
      !previous.some((document) => document.id === id) ||
      reserved.has(id)
    )
      throw new Error(
        "Проверьте соответствие нового файла прежнему материалу.",
      );
    reserved.add(id);
  }
  const used = new Set<string>();
  const entry = (
    document?: SourceDocumentInput,
    prior?: SourceDocument,
  ): SourcePlanEntry => {
    const nextText = document?.markdown ?? null;
    const resolved = reconcileText(
      prior?.sourceMarkdown ?? null,
      prior?.markdown ?? null,
      nextText,
    );
    const renamed = !!document && !!prior && prior.path !== document.path;
    let status: SourcePlanEntry["status"] = "unchanged";
    if (resolved.kind === "conflict") status = "conflict";
    else if (!prior) status = "added";
    else if (renamed) status = "renamed";
    else if (!document && prior.sourceMarkdown !== null) status = "removed";
    else if (
      prior.sourceMarkdown !== nextText ||
      (document &&
        (document.kind !== prior.kind || document.profile !== prior.profile))
    )
      status = "updated";
    return {
      id: prior?.id || `${sourceId}/material/${makeId()}`,
      sourceId,
      path: document?.path || prior!.path,
      kind: document?.kind || prior!.kind,
      profile: document?.profile || prior!.profile,
      aliases: [
        ...new Set([
          ...(prior?.aliases || []),
          ...(renamed ? [prior!.path] : []),
        ]),
      ],
      questionKeys: { ...prior?.questionKeys },
      headingAliases: prior?.headingAliases
        ? { ...prior.headingAliases }
        : undefined,
      previousPath: renamed ? prior!.path : undefined,
      baseline: prior?.sourceMarkdown ?? null,
      current: prior?.markdown ?? null,
      incoming: nextText,
      ...(resolved.kind === "automatic" ? { proposed: resolved.markdown } : {}),
      status,
    };
  };
  const plan = incoming.map((document) => {
    const explicit = Object.hasOwn(matches, document.path)
      ? previous.find((item) => item.id === matches[document.path])
      : undefined;
    const exact = previous.find(
      (item) =>
        !used.has(item.id) &&
        !reserved.has(item.id) &&
        pathKey(item.path) === pathKey(document.path),
    );
    const sameContent = previous.filter(
      (item) =>
        !used.has(item.id) &&
        !reserved.has(item.id) &&
        !paths.has(pathKey(item.path)) &&
        item.sourceMarkdown?.replace(/\r\n?/g, "\n") ===
          document.markdown.replace(/\r\n?/g, "\n"),
    );
    const prior =
      explicit ||
      exact ||
      (sameContent.length === 1 ? sameContent[0] : undefined);
    if (prior) used.add(prior.id);
    return entry(document, prior);
  });
  for (const prior of previous)
    if (!used.has(prior.id)) plan.push(entry(undefined, prior));
  return plan;
}
