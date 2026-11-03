import { z } from "zod";

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  status: z.enum(["completed", "pending", "failed", "interrupted"]),
});
export type DiscussionMessage = z.infer<typeof messageSchema>;
export const historySchema = z.object({
  key: z.string(),
  messages: z.array(messageSchema),
});
export const discussionSchema = z.object({
  messages: z.array(messageSchema),
  busy: z.boolean(),
});
export const streamEventSchema = z.union([
  z.strictObject({ delta: z.string() }),
  z.strictObject({ done: z.boolean() }),
  z.strictObject({ error: z.string() }),
]);
export interface DiscussionMaterial {
  materialKey: string;
  title: string;
  context: string;
}
