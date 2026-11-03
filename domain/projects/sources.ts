import type { SourceReference, Pilot } from "./types.ts";
import type { ProjectCatalog } from "./catalog.ts";

export function sourceUrl(
  step: SourceReference,
  repositories: ProjectCatalog["repositories"],
  revision = "main",
) {
  const repository = repositories[step.project];
  if (!repository) return null;
  if (
    !/^[\w./-]+$/.test(revision) ||
    step.path.split(/[\\/]/).some((part) => part === "..")
  )
    return null;
  return `${repository.replace(/\/$/, "")}/blob/${revision}/${step.path.split("/").map(encodeURIComponent).join("/")}#L${step.line}`;
}
export function localCodeReference(step: SourceReference, root = "") {
  const base = root.trim().replace(/[\\/]+$/, ""),
    separator = base.includes("\\") ? "\\" : "/";
  const path = base
    ? base + separator + step.path.replaceAll("/", separator)
    : step.path;
  return `${path}:${step.line}\n${step.symbol}`;
}
export function highlightedCode(
  pilot: Pilot,
  highlights: ProjectCatalog["codeHighlights"],
) {
  const symbols = highlights[pilot.id];
  return symbols
    ? pilot.code.steps
        .map((step, index) => ({ step, index }))
        .filter(({ step }) => symbols.includes(step.symbol))
    : null;
}
export function sourceContext(
  step: Pick<SourceReference, "project"> &
    Partial<Pick<SourceReference, "path">>,
  labels: ProjectCatalog["sourceLabels"],
) {
  return (
    labels[step.project]?.find((rule) =>
      (step.path || "").startsWith(rule.prefix),
    )?.label || ""
  );
}
