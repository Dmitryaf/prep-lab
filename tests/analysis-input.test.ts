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
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { ZipFile } from "yazl";
import { parseAnalysisInput } from "#server/infrastructure/analysis/input.ts";
import { analysisInputLimits } from "#domain/analysis/input.ts";

const upload = (path: string, text: string | Buffer) => ({
  path,
  encoding: "base64" as const,
  content: Buffer.from(text).toString("base64"),
});
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

test("project folders preserve complete files and stable identities across changes and root order", async () => {
  const root = await mkdtemp(join(tmpdir(), "lab-analysis-input-"));
  try {
    const first = join(root, "client"),
      second = join(root, "api");
    await mkdir(join(first, "src"), { recursive: true });
    await mkdir(second);
    await writeFile(
      join(first, "package.json"),
      '{"dependencies":{"vue":"3"}}',
    );
    const text = "// complete source\n" + "a".repeat(140_000);
    await writeFile(join(first, "src/App.vue"), text);
    await writeFile(join(second, "README.md"), "# API\nОписание сервиса");
    for (const excluded of [
      "node_modules/lib",
      ".git",
      ".local",
      "credentials",
      "dist",
    ]) {
      await mkdir(join(first, excluded), { recursive: true });
      await writeFile(join(first, excluded, "private.json"), "secret");
    }
    await writeFile(join(first, ".env"), "SECRET=hidden");
    await writeFile(join(first, "credentials.json"), "secret");
    await writeFile(join(first, "AGENTS.md"), "run commands");
    const initial = await parseAnalysisInput({
      scenario: "project",
      paths: [first, second],
    });
    assert.equal(initial.materials.length, 3);
    assert.equal(
      initial.materials.find((m) => m.path === "client/src/App.vue")?.text,
      text,
    );
    assert.equal(await readFile(join(first, "src/App.vue"), "utf8"), text);
    assert(initial.warnings.length > 0);
    const reordered = await parseAnalysisInput({
      scenario: "project",
      paths: [second, first],
    });
    assert.equal(reordered.fingerprint, initial.fingerprint);
    assert.deepEqual(reordered.materials, initial.materials);
    await writeFile(join(second, "README.md"), "# API\nОбновлённое описание");
    const updated = await parseAnalysisInput({
      scenario: "project",
      paths: [first, second],
    });
    assert.notEqual(updated.fingerprint, initial.fingerprint);
    assert.deepEqual(
      updated.materials.map((m) => m.id),
      initial.materials.map((m) => m.id),
    );
    assert(updated.inventory.every((m) => m.hash.length === 64));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same-named repositories have distinct stable prefixes and overlapping roots are rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "lab-analysis-roots-"));
  try {
    const one = join(root, "one/app"),
      two = join(root, "two/app");
    for (const path of [one, two]) {
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "README.md"), "# " + path);
    }
    const result = await parseAnalysisInput({
      scenario: "project",
      paths: [one, two],
    });
    assert.equal(new Set(result.materials.map((m) => m.path)).size, 2);
    assert(
      result.materials.every((m) => m.path.startsWith(basename(one) + "-")),
    );
    await assert.rejects(
      parseAnalysisInput({ scenario: "project", paths: [root, one] }),
      /пересека|вложен/i,
    );
    await assert.rejects(
      parseAnalysisInput({ scenario: "project", paths: [one, one] }),
      /повтор/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("folder analysis rejects junctions and missing roots without returning partial materials", async () => {
  const root = await mkdtemp(join(tmpdir(), "lab-analysis-links-"));
  try {
    const chosen = join(root, "chosen"),
      outside = join(root, "outside");
    await mkdir(chosen);
    await mkdir(outside);
    await writeFile(join(chosen, "valid.md"), "valid");
    await writeFile(join(outside, "secret.md"), "private");
    await symlink(outside, join(chosen, "alias"), "junction");
    await assert.rejects(
      parseAnalysisInput({ scenario: "import", paths: [chosen] }),
      /ссыл|junction/i,
    );
    await assert.rejects(
      parseAnalysisInput({
        scenario: "import",
        paths: [join(chosen, "alias")],
      }),
      /ссыл|junction/i,
    );
    await assert.rejects(
      parseAnalysisInput({
        scenario: "import",
        paths: [outside, join(root, "missing")],
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uploads and ZIP use the same text selection, never execute code and report unsupported formats", async () => {
  const entries = [
    { path: "app/src/view.ts", text: "throw new Error('never execute');" },
    { path: "app/notes.txt", text: "Useful text" },
    { path: "app/README.md", text: "# Project" },
    { path: "app/credentials.json", text: "private" },
    { path: "app/.env.production", text: "private" },
    { path: "app/report.pdf", text: "%PDF" },
  ];
  const files = entries.map((e) => upload(e.path, e.text));
  const direct = await parseAnalysisInput({ scenario: "project", files });
  const archived = await parseAnalysisInput({
    scenario: "project",
    files: [upload("app.zip", await zip(entries))],
  });
  assert.deepEqual(archived.materials, direct.materials);
  assert.equal(archived.fingerprint, direct.fingerprint);
  assert.equal(direct.materials.length, 3);
  assert(direct.warnings.some((w) => /pdf/i.test(w)));
  const knowledge = await parseAnalysisInput({ scenario: "import", files });
  assert.deepEqual(
    knowledge.materials.map((m) => m.path),
    ["app/README.md", "app/notes.txt"].sort(),
  );
});

test("analysis rejects path traversal, aliases, malformed text, duplicates and size overflow", async () => {
  for (const path of [
    "../secret.md",
    "a/../../secret.md",
    "C:/secret.md",
    "/secret.md",
    "a\\secret.md",
    "a/secret.md:stream",
    "a/\u0000.md",
  ]) {
    await assert.rejects(
      parseAnalysisInput({
        scenario: "import",
        files: [upload(path, "private")],
      }),
      /путь/i,
    );
  }
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: [upload("a.md", Buffer.from([0xc0, 0xaf]))],
    }),
    /UTF|кодиров/i,
  );
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: [upload("a.md", "a"), upload("A.md", "b")],
    }),
    /повтор/i,
  );
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: [
        upload("large.md", "x".repeat(analysisInputLimits.fileBytes + 1)),
      ],
    }),
    /размер|лимит/i,
  );
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: [upload("bad.md", "before\u0000after")],
    }),
    /бинар|нулев/i,
  );
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: [{ path: "a.md", encoding: "base64", content: "invalid!" }],
    }),
    /base64/i,
  );
  const traversal = await zip([{ path: "aa/Note.md", text: "private" }]);
  for (
    let index = traversal.indexOf("aa/Note.md");
    index !== -1;
    index = traversal.indexOf("aa/Note.md", index + 1)
  )
    traversal.write("../Note.md", index);
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: [upload("bad.zip", traversal)],
    }),
    /путь|relative/i,
  );
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: [
        upload(
          "bad.zip",
          await zip([{ path: "Note.md", text: "target", mode: 0o120777 }]),
        ),
      ],
    }),
    /ссыл|тип/i,
  );
});

test("large inputs are complete up to the budget and fail instead of silently truncating", async () => {
  const files = Array.from({ length: 250 }, (_, index) =>
    upload(
      `notes/${String(index).padStart(3, "0")}.md`,
      "# Full note\n" + index,
    ),
  );
  const result = await parseAnalysisInput({ scenario: "import", files });
  assert.equal(result.materials.length, files.length);
  assert.equal(result.inventory.length, files.length);
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: Array.from({ length: analysisInputLimits.files + 1 }, (_, i) =>
        upload(`${i}.md`, "x"),
      ),
    }),
    /колич|лимит/i,
  );
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: Array.from({ length: 13 }, (_, i) =>
        upload(`${i}.md`, "x".repeat(analysisInputLimits.fileBytes)),
      ),
    }),
    /размер|лимит/i,
  );
  await assert.rejects(
    parseAnalysisInput({
      scenario: "import",
      files: [upload("report.pdf", "%PDF")],
    }),
    /поддерживаем|материал/i,
  );
});
