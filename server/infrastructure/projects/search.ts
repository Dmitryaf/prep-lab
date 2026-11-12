import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import {
  includeAnalysisPath,
  isExcludedAnalysisPath,
} from "#domain/analysis/input.ts";
import { validateSourceRoot } from "#server/infrastructure/sources/folder.ts";

export interface SearchFile {
  path: string;
  text: string;
}

/** Only the server's registered roots may be passed here; never a browser path. */
export async function searchProjectFiles(
  path: string,
  accept: (file: SearchFile) => void,
  include: (path: string) => boolean = () => true,
) {
  const root = await validateSourceRoot(path);
  const limits = { entries: 10000, bytes: 12_000_000, fileBytes: 250_000 };
  let entries = 0;
  let bytesRead = 0;
  let limited = false;
  const normalize = (value: string) =>
    process.platform === "win32" ? value.toLowerCase() : value;
  async function walk(directory: string, prefix: string) {
    // Code directories precede documentation so the bounded search remains useful.
    const children = (await readdir(directory, { withFileTypes: true })).sort(
      (a, b) => {
        const rank = (name: string) =>
          /^(?:app|src|components|features|shared|domain|server)$/.test(name)
            ? 0
            : 1;
        return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
      },
    );
    for (const entry of children) {
      if (++entries > limits.entries || bytesRead >= limits.bytes) {
        limited = true;
        return;
      }
      const relative = prefix + entry.name;
      if (
        isExcludedAnalysisPath(relative) ||
        /(?:^|\/)(?:qa|test-results|playwright-report|storybook-static|public\/assets)(?:\/|$)/i.test(
          relative,
        )
      )
        continue;
      const absolute = join(directory, entry.name);
      const before = await lstat(absolute);
      if (before.isSymbolicLink()) continue;
      if (before.isDirectory()) {
        await walk(absolute, relative + "/");
        continue;
      }
      if (
        !before.isFile() ||
        !includeAnalysisPath(relative, "project") ||
        /\.(?:mdx?|txt|json|ya?ml)$/i.test(relative) ||
        /\.min\.[cm]?js$/i.test(relative) ||
        !include(relative)
      )
        continue;
      if (
        before.size > limits.fileBytes ||
        bytesRead + before.size > limits.bytes
      ) {
        limited = true;
        continue;
      }
      const handle = await open(
        absolute,
        constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
      );
      try {
        const opened = await handle.stat();
        if (
          !opened.isFile() ||
          opened.ino !== before.ino ||
          opened.dev !== before.dev
        )
          throw new Error("Файл изменился во время поиска.");
        const bytes = Buffer.alloc(limits.fileBytes + 1);
        let size = 0;
        while (size < bytes.length) {
          const part = await handle.read(
            bytes,
            size,
            bytes.length - size,
            null,
          );
          if (!part.bytesRead) break;
          size += part.bytesRead;
        }
        const after = await handle.stat();
        if (
          size > limits.fileBytes ||
          after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs ||
          (await lstat(absolute)).isSymbolicLink() ||
          normalize(await realpath(absolute)) !== normalize(absolute)
        )
          throw new Error("Файл изменился или стал ссылкой во время поиска.");
        bytesRead += size;
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, size),
          );
        } catch {
          continue;
        }
        if (
          !text.includes("\0") &&
          !text.split(/\r?\n/).some((line) => line.length > 2000)
        )
          accept({ path: relative, text });
      } finally {
        await handle.close();
      }
    }
  }
  await walk(root, "");
  await validateSourceRoot(root);
  return { limited, filesBytesRead: bytesRead };
}
