import {
  documentInputSchema,
  markdownPathSchema,
  type SourceDocumentInput,
} from "#domain/source/contracts.ts";

export const sourceLimits = {
  files: 200,
  entries: 2000,
  fileBytes: 1_000_000,
  totalBytes: 8_000_000,
  archiveBytes: 8_000_000,
};
export function portablePath(path: string) {
  // Validate every archive entry before exclusions; backslashes never become safe separators.
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes(":")
  )
    throw new Error("Недопустимый путь файла.");
  const parts = path.replace(/\/$/, "").split("/");
  if (
    parts.length > 32 ||
    parts.some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Недопустимый путь файла.");
  return path.normalize("NFC");
}
export function markdownCandidate(path: string) {
  return markdownPathSchema.safeParse(path).success;
}
export class MarkdownSnapshot {
  documents: SourceDocumentInput[] = [];
  skipped = 0;
  private bytes = 0;
  private paths = new Set<string>();
  add(path: string, bytes: Buffer) {
    path = portablePath(path);
    if (!markdownCandidate(path)) {
      this.skipped++;
      return;
    }
    if (
      bytes.length > sourceLimits.fileBytes ||
      this.bytes + bytes.length > sourceLimits.totalBytes
    )
      throw new Error("Превышен лимит размера Markdown-файлов.");
    if (this.documents.length >= sourceLimits.files)
      throw new Error("Превышен лимит количества Markdown-файлов.");
    const key = path.toLowerCase();
    if (this.paths.has(key)) throw new Error("Повторяется путь файла: " + path);
    this.paths.add(key);
    let markdown: string;
    try {
      markdown = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
    } catch {
      throw new Error("Файл должен использовать кодировку UTF-8: " + path);
    }
    this.bytes += bytes.length;
    this.documents.push(documentInputSchema.parse({ path, markdown }));
  }
  result() {
    return { documents: this.documents, skipped: this.skipped };
  }
}
