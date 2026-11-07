import { z } from "zod";
export const codePreviewSchema = z.object({
  text: z.string().max(100000),
  startLine: z.number().int().positive(),
  revision: z.string().max(120).optional(),
});
export type CodePreview = z.infer<typeof codePreviewSchema>;
export function codePresentation(step: {
  explanation: string;
  line: number;
  preview?: CodePreview;
}) {
  if (step.preview)
    return { explanation: step.explanation, preview: step.preview };
  const legacy = step.explanation.match(
    /^([\s\S]*)\n\nПереданный фрагмент:\n\n```text\n([\s\S]*)\n```$/,
  );
  return legacy
    ? {
        explanation: legacy[1],
        preview: { text: legacy[2], startLine: step.line },
      }
    : { explanation: step.explanation, preview: undefined };
}
export function codePreview(
  text: string,
  startLine: number,
  endLine: number,
): CodePreview {
  return {
    startLine,
    text: text
      .split(/\r?\n/)
      .slice(startLine - 1, Math.min(endLine, startLine + 199))
      .join("\n"),
  };
}
