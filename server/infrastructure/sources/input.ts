import { z } from "zod";
import { MarkdownSnapshot, sourceLimits, portablePath } from "./limits.ts";
import { readMarkdownZip } from "./zip.ts";
export { readMarkdownZip } from "./zip.ts";
export { readMarkdownFolder } from "./folder.ts";
export const uploadSchema = z.strictObject({
  path: z.string().max(1024),
  encoding: z.enum(["utf8", "base64"]),
  content: z.string().max(11_000_000),
});
export async function readMarkdownUploads(input: unknown) {
  const uploads = z.array(uploadSchema).parse(input);
  if (uploads.length > sourceLimits.files)
    throw new Error("Превышен лимит количества файлов.");
  if (uploads.length === 1 && /\.zip$/i.test(uploads[0].path)) {
    portablePath(uploads[0].path);
    if (uploads[0].encoding !== "base64")
      throw new Error("Ожидается ZIP в base64.");
    return readMarkdownZip(decode(uploads[0].content));
  }
  const snapshot = new MarkdownSnapshot();
  for (const file of uploads) {
    if (!/\.md$/i.test(file.path))
      throw new Error("Загрузите Markdown-файлы или один ZIP.");
    snapshot.add(
      file.path,
      file.encoding === "utf8"
        ? Buffer.from(file.content, "utf8")
        : decode(file.content),
    );
  }
  return snapshot.result();
}
function decode(input: string) {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      input,
    )
  )
    throw new Error("Некорректное содержимое base64.");
  return Buffer.from(input, "base64");
}
