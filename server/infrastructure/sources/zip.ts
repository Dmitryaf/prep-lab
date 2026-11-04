import { fromBuffer } from "yauzl";
import {
  MarkdownSnapshot,
  sourceLimits,
  portablePath,
  markdownCandidate,
} from "./limits.ts";

export async function readMarkdownZip(bytes: Buffer) {
  if (bytes.length > sourceLimits.archiveBytes)
    throw new Error("Превышен лимит размера ZIP.");
  const archive = await new Promise<import("yauzl").ZipFile>(
    (resolve, reject) =>
      fromBuffer(
        bytes,
        { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
        (error, archive) =>
          error || !archive
            ? reject(error || new Error("Архив не открыт."))
            : resolve(archive),
      ),
  );
  const snapshot = new MarkdownSnapshot();
  return new Promise<ReturnType<MarkdownSnapshot["result"]>>(
    (resolve, reject) => {
      let count = 0,
        expanded = 0,
        stopped = false;
      const fail = (error: Error) => {
        if (!stopped) {
          stopped = true;
          archive.close();
          reject(error);
        }
      };
      archive.on("error", fail);
      archive.on("end", () => {
        if (!stopped) {
          stopped = true;
          resolve(snapshot.result());
        }
      });
      archive.on("entry", (entry) => {
        try {
          if (++count > sourceLimits.entries)
            throw new Error("Превышен лимит количества записей ZIP.");
          const path = portablePath(entry.fileName);
          const type = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (type && type !== 0o100000 && type !== 0o040000)
            throw new Error(
              "Ссылки и специальные типы файлов в ZIP не разрешены.",
            );
          if (entry.isEncrypted())
            throw new Error("Зашифрованный ZIP не поддерживается.");
          expanded += entry.uncompressedSize;
          if (expanded > sourceLimits.totalBytes)
            throw new Error("Превышен лимит распакованного размера ZIP.");
          if (path.endsWith("/") || !markdownCandidate(path)) {
            snapshot.skipped++;
            archive.readEntry();
            return;
          }
          if (entry.uncompressedSize > sourceLimits.fileBytes)
            throw new Error("Превышен лимит размера Markdown-файла.");
          archive.openReadStream(entry, (error, stream) => {
            if (error || !stream)
              return fail(error || new Error("Файл ZIP недоступен."));
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on("error", fail);
            stream.on("data", (chunk) => {
              size += chunk.length;
              if (size > sourceLimits.fileBytes) {
                stream.destroy();
                fail(new Error("Превышен лимит размера файла."));
              } else chunks.push(chunk);
            });
            stream.on("end", () => {
              if (stopped) return;
              try {
                snapshot.add(path, Buffer.concat(chunks));
                archive.readEntry();
              } catch (error) {
                fail(error instanceof Error ? error : new Error("Ошибка ZIP."));
              }
            });
          });
        } catch (error) {
          fail(error instanceof Error ? error : new Error("Ошибка ZIP."));
        }
      });
      archive.readEntry();
    },
  );
}
