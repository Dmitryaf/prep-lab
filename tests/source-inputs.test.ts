import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ZipFile } from "yazl";
import {
  readMarkdownFolder,
  readMarkdownZip,
  readMarkdownUploads,
} from "#server/infrastructure/sources/input.ts";

async function zip(entries: { path: string; text: string; mode?: number }[]) {
  const archive = new ZipFile();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.outputStream.on("data", (chunk) => chunks.push(chunk));
    archive.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    archive.outputStream.on("error", reject);
  });
  for (const entry of entries)
    archive.addBuffer(Buffer.from(entry.text), entry.path, {
      mode: entry.mode,
    });
  archive.end();
  return done;
}

test("folder snapshots read only Markdown and leave originals byte-for-byte unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "lab-source-"));
  try {
    await mkdir(join(root, "Docs"));
    const bytes = Buffer.from("# Тема\r\nТекст.\r\n");
    await writeFile(join(root, "Docs/Note.md"), bytes);
    await writeFile(join(root, "AGENTS.md"), "Не учебный материал.");
    await writeFile(join(root, "private.exe"), "ignored");
    const result = await readMarkdownFolder(root);
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].path, "Docs/Note.md");
    assert.deepEqual(await readFile(join(root, "Docs/Note.md")), bytes);
    await assert.rejects(readMarkdownFolder(join(root, "missing")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("folder snapshots reject junction leaves and a junction in an allowed root ancestor", async () => {
  const root = await mkdtemp(join(tmpdir(), "lab-source-links-"));
  try {
    await mkdir(join(root, "vault"));
    await mkdir(join(root, "outside"));
    await writeFile(join(root, "outside/Secret.md"), "secret");
    await symlink(join(root, "outside"), join(root, "vault/alias"), "junction");
    await assert.rejects(
      readMarkdownFolder(join(root, "vault")),
      /ссыл|junction|переход/i,
    );
    await symlink(join(root, "vault"), join(root, "root-alias"), "junction");
    await assert.rejects(
      readMarkdownFolder(join(root, "root-alias/alias")),
      /ссыл|junction|переход/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ZIP files are never extracted, obey budgets and reject aliases and portable path collisions", async () => {
  const valid = await zip([
    { path: "Docs/Note.md", text: "# Заметка\nТекст" },
    { path: ".obsidian/config.json", text: "{}" },
  ]);
  assert.equal(
    (await readMarkdownZip(valid)).documents[0].path,
    "Docs/Note.md",
  );
  await assert.rejects(
    readMarkdownZip(
      await zip([
        { path: "A.md", text: "a" },
        { path: "a.md", text: "b" },
      ]),
    ),
    /повтор|путь/i,
  );
  await assert.rejects(
    readMarkdownZip(
      await zip([{ path: "Note.md", text: "target", mode: 0o120777 }]),
    ),
    /ссыл|тип/i,
  );
  await assert.rejects(
    readMarkdownZip(
      await zip([{ path: "Huge.md", text: "a".repeat(1_000_001) }]),
    ),
    /размер|лимит/i,
  );
  // Mutate a safe, equal-length central/local name to test traversal without relying on the ZIP writer accepting it.
  const traversal = await zip([{ path: "aa/Note.md", text: "unsafe" }]);
  for (
    let index = traversal.indexOf("aa/Note.md");
    index !== -1;
    index = traversal.indexOf("aa/Note.md", index + 1)
  )
    traversal.write("../Note.md", index);
  await assert.rejects(readMarkdownZip(traversal), /путь|relative/i);
});

test("uploads reject malformed UTF-8 and total size/count overflow before producing a snapshot", async () => {
  const large = "x".repeat(900_000);
  assert.equal(
    (
      await readMarkdownUploads([
        {
          path: "Large.md",
          content: Buffer.from(large).toString("base64"),
          encoding: "base64",
        },
      ])
    ).documents[0].markdown,
    large,
  );
  await assert.rejects(
    readMarkdownUploads([
      {
        path: "Note.md",
        content: Buffer.from([0xc0, 0xaf]).toString("base64"),
        encoding: "base64",
      },
    ]),
    /UTF|кодиров/i,
  );
  await assert.rejects(
    readMarkdownUploads(
      Array.from({ length: 201 }, (_, id) => ({
        path: `${id}.md`,
        content: "text",
        encoding: "utf8",
      })),
    ),
    /колич|лимит/i,
  );
  await assert.rejects(
    readMarkdownUploads([
      { path: "../Secret.md", content: "x", encoding: "utf8" },
    ]),
    /путь/i,
  );
});
