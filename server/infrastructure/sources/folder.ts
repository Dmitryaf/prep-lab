import { lstat, readdir, realpath, open } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, parse, join, relative } from "node:path";
import { MarkdownSnapshot, sourceLimits, markdownCandidate } from "./limits.ts";

export async function validateSourceRoot(path: string) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of relative(current, absolute)
    .split(/[\\/]/)
    .filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink())
      throw new Error(
        "Символические ссылки и junction в пути источника не разрешены.",
      );
  }
  if (!(await lstat(absolute)).isDirectory())
    throw new Error("Источник должен быть папкой.");
  if ((await realpath(absolute)).toLowerCase() !== absolute.toLowerCase())
    throw new Error("Переход по ссылке в пути источника не разрешён.");
  return absolute;
}
export async function readMarkdownFolder(path: string) {
  const root = await validateSourceRoot(path),
    snapshot = new MarkdownSnapshot();
  let count = 0;
  async function walk(directory: string, prefix: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++count > sourceLimits.entries)
        throw new Error("Превышен лимит количества файлов и папок.");
      const absolute = join(directory, entry.name),
        name = prefix + entry.name;
      const before = await lstat(absolute);
      if (before.isSymbolicLink())
        throw new Error(
          "Символические ссылки и junction внутри источника не разрешены.",
        );
      if (before.isDirectory()) {
        // A synthetic leaf applies the same folder exclusions as the upload contract.
        if (markdownCandidate(name + "/allowed.md"))
          await walk(absolute, name + "/");
        else snapshot.skipped++;
      } else if (before.isFile() && markdownCandidate(name)) {
        if (before.size > sourceLimits.fileBytes)
          throw new Error("Превышен лимит размера файла: " + name);
        const handle = await open(
          absolute,
          constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
        );
        try {
          const opened = await handle.stat();
          if (
            opened.ino !== before.ino ||
            opened.dev !== before.dev ||
            !opened.isFile()
          )
            throw new Error("Файл изменился во время чтения.");
          const bytes = Buffer.alloc(sourceLimits.fileBytes + 1);
          let size = 0;
          while (size < bytes.length) {
            const result = await handle.read(
              bytes,
              size,
              bytes.length - size,
              null,
            );
            if (!result.bytesRead) break;
            size += result.bytesRead;
          }
          const after = await handle.stat();
          if (
            after.size !== before.size ||
            after.mtimeMs !== before.mtimeMs ||
            (await lstat(absolute)).isSymbolicLink() ||
            (await realpath(absolute)).toLowerCase() !== absolute.toLowerCase()
          )
            throw new Error("Файл изменился или стал ссылкой во время чтения.");
          snapshot.add(name, bytes.subarray(0, size));
        } finally {
          await handle.close();
        }
      } else snapshot.skipped++;
    }
  }
  await walk(root, "");
  await validateSourceRoot(root);
  return snapshot.result();
}
