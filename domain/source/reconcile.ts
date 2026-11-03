export type SourceText = string | null;
export type TextReconciliation =
  | { kind: "automatic"; markdown: SourceText }
  | {
      kind: "conflict";
      baseline: SourceText;
      current: SourceText;
      incoming: SourceText;
    };

export function reconcileText(
  baseline: SourceText,
  current: SourceText,
  incoming: SourceText,
): TextReconciliation {
  const equal = (first: SourceText, second: SourceText) =>
    first?.replace(/\r\n?/g, "\n") === second?.replace(/\r\n?/g, "\n");
  if (equal(incoming, baseline) || equal(current, incoming))
    return { kind: "automatic", markdown: current };
  if (equal(current, baseline))
    return { kind: "automatic", markdown: incoming };
  return { kind: "conflict", baseline, current, incoming };
}
