import { z } from "zod";
import type { Progress } from "../../../../domain/interview/state.ts";
import { preparationEnvelope } from "../../../../domain/interview/contracts.ts";

export class PreparationRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function request(method: string, suffix = "", input?: unknown) {
  const response = await fetch("/api/preparation" + suffix, {
    method,
    ...(input === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(result);
    throw new PreparationRequestError(
      response.status,
      error.success
        ? error.data.error
        : "Не удалось подключиться к данным экземпляра.",
    );
  }
  return preparationEnvelope.parse(result);
}
export const readPreparation = () => request("GET");
export const writePreparation = (state: Progress, expectedRevision: number) =>
  request("PUT", "", { state, expectedRevision });
export const migratePreparation = (state: Progress) =>
  request("POST", "/migrate", { state });
