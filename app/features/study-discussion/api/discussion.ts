import { z } from "zod";
import {
  discussionSchema,
  streamEventSchema,
} from "../../../../domain/discussion/contracts.ts";

const endpoint = (key: string, operation?: "cancel" | "preview") =>
  "/api/study-chat" +
  (operation ? "/" + operation : "") +
  "?key=" +
  encodeURIComponent(key);
export class DiscussionRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function requireSuccess(response: Response) {
  if (!response.ok) {
    const data = z
      .object({ error: z.string() })
      .safeParse(await response.json());
    throw new DiscussionRequestError(
      response.status,
      data.success
        ? data.data.error
        : "Не удалось выполнить запрос обсуждения.",
    );
  }
}
export async function getDiscussion(key: string) {
  const response = await fetch(endpoint(key));
  await requireSuccess(response);
  return discussionSchema.parse(await response.json());
}
export async function cancelDiscussion(key: string) {
  const response = await fetch(endpoint(key, "cancel"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  await requireSuccess(response);
}
export async function previewDiscussion(
  key: string,
  message: string,
  context: string,
) {
  const response = await fetch(endpoint(key, "preview"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context }),
  });
  await requireSuccess(response);
  return z.object({ prompt: z.string() }).parse(await response.json()).prompt;
}
export async function sendDiscussion(
  key: string,
  message: string,
  context: string,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
  expectedPrompt?: string,
) {
  const response = await fetch(endpoint(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      context,
      ...(expectedPrompt === undefined ? {} : { expectedPrompt }),
    }),
    signal,
  });
  await requireSuccess(response);
  if (!response.body) throw new Error("Сервер не прислал поток ответа.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    completed = false;
  const consume = (line: string) => {
    if (!line) return;
    const event = streamEventSchema.parse(JSON.parse(line));
    if ("error" in event) throw new Error(event.error);
    if ("delta" in event) onDelta(event.delta);
    if ("done" in event) completed = event.done;
  };
  try {
    while (true) {
      const part = await reader.read();
      buffer += decoder.decode(part.value, { stream: !part.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(consume);
      if (part.done) {
        consume(buffer);
        break;
      }
    }
    if (!completed)
      throw new Error(
        "Связь прервалась. Обновите обсуждение, чтобы проверить сохранённый ответ.",
      );
  } finally {
    reader.releaseLock();
  }
}
