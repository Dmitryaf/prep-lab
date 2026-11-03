import {
  settingsEnvelopeSchema,
  type InstanceSettings,
} from "../../../../domain/instance/contracts.ts";

export async function requestSettings(method = "GET", body?: unknown) {
  const response = await fetch(
    "/api/settings" + (method === "POST" ? "/migrate" : ""),
    {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "Настройки недоступны. Изменение не сохранено.",
    );
  return settingsEnvelopeSchema.parse(data);
}
export const writeSettings = (settings: InstanceSettings, revision: number) =>
  requestSettings("PUT", { settings, revision });
