import { z } from "zod";
import { validateState } from "./saved-state.ts";

export const savedStateSchema = z.unknown().transform((input, context) => {
  try {
    return validateState(input);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof Error
          ? error.message
          : "Некорректные данные подготовки.",
    });
    return z.NEVER;
  }
});
export const preparationEnvelope = z.object({
  state: savedStateSchema,
  revision: z.int().nonnegative(),
});
export const savePreparationInput = z.strictObject({
  state: savedStateSchema,
  expectedRevision: z.int().nonnegative(),
});
export const migratePreparationInput = z.strictObject({
  state: savedStateSchema,
});
