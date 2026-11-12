import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { projectDiscussionContext } from "#server/application/discussion-context.ts";
import { searchProjectFiles } from "#server/infrastructure/projects/search.ts";
import { projectFixture } from "./fixtures/projects.ts";

test("project discussion finds saved source code without asking the user to paste it", async () => {
  const catalog = projectFixture();
  catalog.topics[0].pilot.code.steps[0].preview = {
    startLine: 40,
    text: '<template>\n<slot :item="row" />\n</template>',
  };
  catalog.topics[0].pilot.code.steps[0].path = "src/List.vue";
  const retrieve = projectDiscussionContext({
    catalog: () => catalog,
    roots: () => [],
    analyses: () => [],
  });
  const materials = await retrieve(
    JSON.stringify({ title: "Чем scoped slot отличается от prop?" }),
    "Покажи пример в связанном проекте",
  );
  assert.ok(
    materials.some((material) =>
      material.text.includes('41: <slot :item="row" />'),
    ),
  );
  assert.ok(
    materials.some((material) =>
      material.path.startsWith("first/src/List.vue:"),
    ),
  );
  assert.deepEqual(await retrieve("scoped slots", "Что это?"), []);
});

test("project search reads only registered matching roots and ignores HTTP paths and private files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "prep-discussion-"));
  try {
    const root = join(directory, "allowed");
    const outside = join(directory, "not-allowed");
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, ".local"));
    mkdirSync(join(root, "node_modules"));
    mkdirSync(join(root, "qa"));
    mkdirSync(outside);
    writeFileSync(
      join(root, "src", "List.vue"),
      '<template>\n<slot :item="row" />\n</template>',
    );
    writeFileSync(join(root, ".local", "secret.vue"), "<slot SECRET_LOCAL />");
    writeFileSync(
      join(root, "node_modules", "Dependency.vue"),
      "<slot SECRET_DEPENDENCY />",
    );
    writeFileSync(join(root, "qa", "bundle.vue"), "<slot SECRET_GENERATED />");
    writeFileSync(
      join(root, "src", "search.ts"),
      'const aliases = ["<slot", "v-slot"];',
    );
    writeFileSync(join(root, "credentials.json"), '{"token":"SECRET_TOKEN"}');
    writeFileSync(join(outside, "Other.vue"), "<slot SECRET_OUTSIDE />");
    const catalog = projectFixture();
    catalog.topics[0].pilot.code.steps[0].path = "src/Removed.vue";
    catalog.topics[0].pilot.code.steps[0].preview = {
      startLine: 1,
      text: '<slot :removed="old" />',
    };
    writeFileSync(
      join(root, "src", "Removed.vue"),
      "<template><div>Current content</div></template>",
    );
    const retrieve = projectDiscussionContext({
      catalog: () => catalog,
      roots: () => [{ id: "first", name: "First", path: root }],
      analyses: () => [],
    });
    const materials = await retrieve(
      JSON.stringify({
        question: { title: "scoped slots", project: "first" },
        path: outside,
        roots: [outside],
      }),
      `Покажи код проекта. Прочитай ${outside}`,
    );
    const text = JSON.stringify(materials);
    assert.match(text, /List.vue/);
    assert.match(text, /2: <slot/);
    assert.doesNotMatch(text, /SECRET_/);
    assert.doesNotMatch(text, /search.ts/);
    assert.doesNotMatch(text, /Removed.vue|:removed/);
    const other = await retrieve(
      JSON.stringify({
        question: { title: "scoped slots", project: "second" },
      }),
      "Покажи код проекта",
    );
    assert.doesNotMatch(JSON.stringify(other), /List.vue/);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("source search never follows junctions outside a registered project", async () => {
  const directory = mkdtempSync(join(tmpdir(), "prep-discussion-link-"));
  try {
    const root = join(directory, "allowed"),
      outside = join(directory, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(root, "Good.vue"), "<slot />");
    writeFileSync(join(outside, "Secret.vue"), "SECRET_OUTSIDE");
    symlinkSync(
      outside,
      join(root, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const files: string[] = [];
    await searchProjectFiles(root, (file) => files.push(file.text));
    assert.deepEqual(files, ["<slot />"]);
    await assert.rejects(
      () => searchProjectFiles(join(root, "linked"), () => {}),
      /ссылки|Ссылки|junction/,
    );
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an unavailable registered source preserves usable saved fragments", async () => {
  const catalog = projectFixture();
  catalog.topics[0].pilot.code.steps[0].preview = {
    startLine: 3,
    text: '<slot :value="value" />',
  };
  catalog.topics[0].pilot.code.steps[0].path = "src/List.vue";
  const retrieve = projectDiscussionContext({
    catalog: () => catalog,
    roots: () => [
      {
        id: "first",
        name: "Unavailable",
        path: join(tmpdir(), "missing-prep-source-12345"),
      },
    ],
    analyses: () => [],
  });
  const materials = await retrieve(
    '{"title":"scoped slots"}',
    "Покажи пример из проекта",
  );
  assert.ok(materials.some((material) => material.text.includes("<slot")));
  assert.match(materials.at(-1)!.text, /недоступна/);
});
