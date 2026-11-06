import { z } from "zod";
import {
  analysisJobSchema,
  type AnalysisJob,
  type AnalysisRequest,
} from "#domain/analysis/contracts.ts";
export type { AnalysisJob };
export type AnalysisInput = AnalysisRequest;
async function request(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch("/api/analysis" + path, {
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
      typeof result.error === "string"
        ? result.error
        : "Не удалось выполнить анализ.",
    );
  return result;
}
export const listAnalyses = async () =>
  z.object({ jobs: z.array(analysisJobSchema) }).parse(await request(""));
export const readAnalysis = async (id: string) =>
  analysisJobSchema.parse(await request("/" + encodeURIComponent(id)));
export const startAnalysis = async (input: AnalysisInput) =>
  analysisJobSchema.parse(await request("", input));
export const cancelAnalysis = async (id: string) =>
  analysisJobSchema.parse(
    await request("/" + encodeURIComponent(id) + "/cancel", {}),
  );
export const acceptAnalysis = async (id: string, selected: string[]) =>
  analysisJobSchema.parse(
    await request("/" + encodeURIComponent(id) + "/accept", { selected }),
  );
export const updateAnalysis = async (id: string) =>
  analysisJobSchema.parse(
    await request("/" + encodeURIComponent(id) + "/update", {}),
  );
