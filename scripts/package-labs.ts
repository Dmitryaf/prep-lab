import { mkdir, readFile, lstat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ZipFile } from "yazl";

const root = fileURLToPath(new URL("../", import.meta.url));
// Only reviewed teaching resources enter public downloads, never instance data.
const packages: Record<string, string[]> = {
  "request-lifecycle": [
    "README.md",
    ".npmrc",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vitest.config.ts",
    "useLatestSearch.ts",
    "useLatestSearch.test.ts",
    "searchUsers.ts",
  ],
  "react-behavior": [
    "README.md",
    ".npmrc",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "index.html",
    "src/main.tsx",
    "src/style.css",
    "src/DraftRows.tsx",
    "src/examples/composition.tsx",
    "src/examples/form.tsx",
    "src/examples/router.tsx",
    "src/examples/search.tsx",
    "src/examples/offline.tsx",
    "src/examples/resize.tsx",
    "tests/behavior.test.tsx",
    "tests/composition.test.tsx",
    "tests/offline-review.test.tsx",
  ],
};

export async function packageLabs(destination = resolve(root, "public/labs")) {
  const output = resolve(destination);
  await mkdir(output, { recursive: true });
  for (const [name, paths] of Object.entries(packages)) {
    const archive = new ZipFile();
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((yes, no) => {
      archive.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.outputStream.on("error", no);
      archive.outputStream.on("end", () => yes(Buffer.concat(chunks)));
    });
    for (const path of paths) {
      const source = resolve(root, "exercises", name, path);
      if (!(await lstat(source)).isFile())
        throw Error(`Not a regular lab file: ${name}/${path}`);
      archive.addBuffer(await readFile(source), `${name}/${path}`, {
        mtime: new Date("2026-01-01T00:00:00Z"),
      });
    }
    archive.end();
    await writeFile(resolve(output, `${name}.zip`), await complete);
  }
  await writeFile(
    resolve(output, "performance-lab.html"),
    (
      await readFile(resolve(root, "exercises/performance-lab.html"), "utf8")
    ).replace(/\r\n?/g, "\n"),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await packageLabs(process.argv[2]);
}
