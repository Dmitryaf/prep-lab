import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, join, sep } from "node:path";
import { fromBuffer } from "yauzl";
import {
  analysisInputSchema,
  includeAnalysisPath,
  isExcludedAnalysisPath,
  analysisInputLimits as limits,
  type AnalysisInput,
  type AnalysisInputResult,
  type AnalysisMaterial,
  type AnalysisInventoryEntry,
} from "#domain/analysis/input.ts";
import { portablePath } from "#server/infrastructure/sources/limits.ts";
import { validateSourceRoot } from "#server/infrastructure/sources/folder.ts";

// Both upload and ZIP paths must be portable, including on Windows.
// eslint-disable-next-line no-control-regex -- Reject control characters in untrusted file names.
const unsafeCharacters = /[\x00-\x1f<>"|?*]/;
function checkedPath(value: string) {
  const path = portablePath(value);
  if (
    path.length > 1024 ||
    unsafeCharacters.test(path) ||
    path
      .replace(/\/$/, "")
      .split("/")
      .some(
        (part) =>
          /[. ]$/.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  ) {
    throw new Error("Недопустимый путь файла.");
  }
  return path;
}
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const keyPath = (value: string) =>
  process.platform === "win32" ? value.toLowerCase() : value;

class Snapshot {
  materials: AnalysisMaterial[] = [];
  inventory: AnalysisInventoryEntry[] = [];
  private total = 0;
  private names = new Set<string>();
  private skipped = new Map<string, number>();
  readonly scenario: AnalysisInput["scenario"];
  constructor(scenario: AnalysisInput["scenario"]) {
    this.scenario = scenario;
  }
  skip(path: string, excluded = false) {
    const reason = excluded
      ? "служебные файлы и закрытые каталоги"
      : extname(path).toLowerCase() || "файлы без расширения";
    this.skipped.set(reason, (this.skipped.get(reason) || 0) + 1);
  }
  add(name: string, bytes: Buffer) {
    const path = checkedPath(name);
    if (!includeAnalysisPath(path, this.scenario)) {
      this.skip(path, isExcludedAnalysisPath(path));
      return;
    }
    if (
      bytes.length > limits.fileBytes ||
      this.total + bytes.length > limits.totalBytes
    )
      throw new Error("Превышен лимит размера материалов: " + path);
    if (this.materials.length >= limits.files)
      throw new Error("Превышен лимит количества материалов.");
    const key = path.toLowerCase();
    if (this.names.has(key)) throw new Error("Повторяется путь файла: " + path);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Файл должен использовать кодировку UTF-8: " + path);
    }
    if (text.includes("\0"))
      throw new Error("Бинарный файл с нулевыми байтами: " + path);
    this.names.add(key);
    this.total += bytes.length;
    this.materials.push({ id: "analysis:" + hash(path), path, text });
    this.inventory.push({ path, size: bytes.length, hash: hash(bytes) });
  }
  result(roots: string[]): AnalysisInputResult {
    if (!this.materials.length)
      throw new Error(
        "В выбранных источниках нет поддерживаемых текстовых материалов.",
      );
    const byPath = <T extends { path: string }>(a: T, b: T) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    this.materials.sort(byPath);
    this.inventory.sort(byPath);
    return {
      materials: this.materials,
      inventory: this.inventory,
      roots,
      warnings: [...this.skipped]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([reason, count]) => `Пропущено: ${reason} — ${count}.`),
      fingerprint: hash(JSON.stringify(this.inventory)),
    };
  }
}

async function readFolder(
  root: string,
  prefix: string,
  snapshot: Snapshot,
  budget: { entries: number },
) {
  async function walk(directory: string, local: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++budget.entries > limits.entries)
        throw new Error("Превышен лимит количества файлов и папок.");
      const absolute = join(directory, entry.name),
        path = checkedPath(local + entry.name);
      const before = await lstat(absolute);
      if (before.isSymbolicLink())
        throw new Error(
          "Символические ссылки и junction внутри источника не разрешены.",
        );
      if (isExcludedAnalysisPath(path)) {
        snapshot.skip(path, true);
        continue;
      }
      if (before.isDirectory()) {
        await walk(absolute, path + "/");
        continue;
      }
      if (!before.isFile() || !includeAnalysisPath(path, snapshot.scenario)) {
        snapshot.skip(path, isExcludedAnalysisPath(path));
        continue;
      }
      if (before.size > limits.fileBytes)
        throw new Error("Превышен лимит размера файла: " + path);
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
          after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs ||
          (await lstat(absolute)).isSymbolicLink() ||
          keyPath(await realpath(absolute)) !== keyPath(absolute)
        )
          throw new Error("Файл изменился или стал ссылкой во время чтения.");
        snapshot.add(prefix + "/" + path, bytes.subarray(0, size));
      } finally {
        await handle.close();
      }
    }
  }
  await walk(root, "");
  await validateSourceRoot(root);
}

async function readZip(
  bytes: Buffer,
  snapshot: Snapshot,
  budget: { entries: number },
) {
  if (bytes.length > limits.archiveBytes)
    throw new Error("Превышен лимит размера ZIP.");
  const archive = await new Promise<import("yauzl").ZipFile>(
    (resolve, reject) => {
      fromBuffer(
        bytes,
        { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
        (error, result) =>
          error || !result
            ? reject(error || new Error("Архив не открыт."))
            : resolve(result),
      );
    },
  );
  await new Promise<void>((resolve, reject) => {
    let stopped = false,
      expanded = 0;
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
        resolve();
      }
    });
    archive.on("entry", (entry) => {
      try {
        if (++budget.entries > limits.entries)
          throw new Error("Превышен лимит количества записей ZIP.");
        const path = checkedPath(entry.fileName);
        const type = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (type && type !== 0o100000 && type !== 0o040000)
          throw new Error(
            "Ссылки и специальные типы файлов в ZIP не разрешены.",
          );
        if (entry.isEncrypted())
          throw new Error("Зашифрованный ZIP не поддерживается.");
        expanded += entry.uncompressedSize;
        if (expanded > limits.totalBytes)
          throw new Error("Превышен лимит распакованного размера ZIP.");
        if (
          path.endsWith("/") ||
          !includeAnalysisPath(path, snapshot.scenario)
        ) {
          if (!path.endsWith("/"))
            snapshot.skip(path, isExcludedAnalysisPath(path));
          archive.readEntry();
          return;
        }
        if (entry.uncompressedSize > limits.fileBytes)
          throw new Error("Превышен лимит размера файла: " + path);
        archive.openReadStream(entry, (error, stream) => {
          if (error || !stream)
            return fail(error || new Error("Файл ZIP недоступен."));
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on("error", fail);
          stream.on("data", (chunk) => {
            size += chunk.length;
            if (size > limits.fileBytes) {
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
  });
}

/** Reads selected content only. The caller must authorize filesystem roots before invoking this function. */
export async function parseAnalysisInput(
  raw: AnalysisInput,
): Promise<AnalysisInputResult> {
  const input = analysisInputSchema.parse(raw),
    snapshot = new Snapshot(input.scenario);
  const roots: string[] = [];
  for (const path of input.paths) {
    if (!isAbsolute(path)) throw new Error("Укажите абсолютный путь к папке.");
    if (isExcludedAnalysisPath(path))
      throw new Error(
        "Служебный или закрытый каталог нельзя использовать как источник.",
      );
    const root = await validateSourceRoot(path);
    for (const previous of roots) {
      if (keyPath(previous) === keyPath(root))
        throw new Error("Повторяется папка источника.");
      if (
        keyPath(root).startsWith(keyPath(previous) + sep) ||
        keyPath(previous).startsWith(keyPath(root) + sep)
      )
        throw new Error(
          "Корни источников пересекаются: не выбирайте вложенные папки вместе.",
        );
    }
    roots.push(root);
  }
  roots.sort((a, b) => (keyPath(a) < keyPath(b) ? -1 : 1));
  const budget = { entries: 0 };
  for (const root of roots) {
    const name = basename(root);
    if (!name)
      throw new Error(
        "Выберите папку проекта или материалов, а не корень диска.",
      );
    const duplicates =
      roots.filter(
        (other) => basename(other).toLowerCase() === name.toLowerCase(),
      ).length > 1;
    await readFolder(
      root,
      name + (duplicates ? "-" + hash(keyPath(root)).slice(0, 8) : ""),
      snapshot,
      budget,
    );
  }
  let uploaded = 0;
  for (const file of input.files) {
    const path = checkedPath(file.path);
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        file.content,
      )
    )
      throw new Error("Некорректное содержимое base64.");
    const bytes = Buffer.from(file.content, "base64");
    uploaded += bytes.length;
    if (uploaded > limits.totalBytes)
      throw new Error("Превышен лимит размера загрузки.");
    if (/\.zip$/i.test(path)) await readZip(bytes, snapshot, budget);
    else snapshot.add(path, bytes);
  }
  return snapshot.result(roots);
}
