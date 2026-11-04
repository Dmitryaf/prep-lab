import { z } from "zod";
const statusSchema = z.object({
  connected: z.boolean(),
  expiresAt: z.string().nullable(),
  needsRefresh: z.boolean(),
  pending: z.boolean(),
  message: z.string(),
  active: z.boolean(),
  localLoginAvailable: z.boolean(),
});
async function request(path = "", mutate = false) {
  const response = await fetch("/api/connection" + path, {
    cache: "no-store",
    ...(mutate
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Подключение ChatGPT недоступно.",
    );
  return result;
}
export const readConnection = async () => statusSchema.parse(await request());
export const startConnection = async () =>
  z
    .object({ url: z.string().url(), expiresAt: z.string() })
    .parse(await request("/login", true));
export const cancelConnection = () => request("/cancel-login", true);
export const renewConnection = () => request("/refresh", true);
export const removeConnection = async () =>
  z.object({ message: z.string() }).parse(await request("/disconnect", true));
