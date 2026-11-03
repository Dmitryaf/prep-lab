import { z } from "zod";

export const instanceSettingsSchema = z.object({
  sourceRoot: z.string().max(4096),
  profile: z.enum(["vue", "react"]),
});
export type InstanceSettings = z.infer<typeof instanceSettingsSchema>;
export const settingsEnvelopeSchema = z.object({
  settings: instanceSettingsSchema,
  revision: z.int().nonnegative(),
});
export const saveSettingsInput = settingsEnvelopeSchema.strict();
export const migrateSettingsInput = z
  .object({ sourceRoot: z.string().max(4096) })
  .strict();
