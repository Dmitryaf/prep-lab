import { z } from "zod";
import {
  acceptedSourceSchema,
  previewSchema,
  type AcceptSource,
} from "../../../../domain/source/preview.ts";
export const sourceCatalogSchema = z.object({
  revision: z.number(),
  sources: z.array(acceptedSourceSchema),
  roots: z.array(z.object({ id: z.string(), name: z.string() })),
  pending: z.array(
    z.object({ id: z.string(), name: z.string(), createdAt: z.string() }),
  ),
});
export type SourceCatalog = z.infer<typeof sourceCatalogSchema>;
async function request(path: string, body?: unknown) {
  const response = await fetch("/api/sources" + path, {
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
        : "Не удалось обновить источник.",
    );
  return result;
}
export const readSources = async () =>
  sourceCatalogSchema.parse(await request(""));
export const readPreview = async (id: string) =>
  previewSchema.parse(await request("/preview/" + encodeURIComponent(id)));
export const prepareSource = async (body: unknown) => {
  const result = await request("/preview", body);
  return {
    preview: previewSchema.parse(result.preview),
    skipped: z.number().parse(result.skipped),
  };
};
export const editMaterial = async (body: unknown) =>
  previewSchema.parse(await request("/edit", body));
export const rematchFiles = async (
  id: string,
  matches: Record<string, string>,
) => previewSchema.parse(await request("/rematch", { id, matches }));
export const acceptSource = (id: string, options: AcceptSource) =>
  request("/accept", { id, ...options });
export const discardSource = (id: string) => request("/discard", { id });
export const saveReview = (id: string, options: AcceptSource) =>
  request("/draft", { id, ...options });
export const inspectSource = async (id: string, options: AcceptSource) =>
  z
    .object({
      notes: z.number(),
      questions: z.number(),
      warnings: z.array(z.string()),
      errors: z.array(z.string()),
    })
    .parse(await request("/inspect", { id, ...options }));
