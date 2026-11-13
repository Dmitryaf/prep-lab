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

test("ranked excerpt budget keeps a late handler ahead of long initial context", async () => {
  const catalog = projectFixture();
  const step = catalog.topics[0].pilot.code.steps[0];
  step.path = "src/LongForm.ts";
  step.preview = {
    startLine: 40,
    text: [
      "const draftStatus = 0;",
      ...Array(110).fill("// " + "ordinary initialization ".repeat(10)),
      "async function persistDraft() {",
      "  await repository.writeDraft(form);",
      "}",
    ].join("\n"),
  };
  const retrieve = projectDiscussionContext({
    catalog: () => catalog,
    roots: () => [],
    analyses: () => [],
  });
  const materials = await retrieve(
    JSON.stringify({ question: { title: "Черновик", project: "first" } }),
    "Покажи сохранение в проекте",
  );
  const fragment = materials.find((item) => item.path.includes("LongForm.ts"))!;
  assert(fragment.text.includes("151: async function persistDraft()"));
  assert(fragment.text.includes("152:   await repository.writeDraft(form)"));
  assert(fragment.text.split("\n\n").slice(1).join("\n\n").length <= 14000);
});

test("scoped slot search reserves both roles when one role fills the result limit", async () => {
  for (const crowded of ["provider", "consumer", "provider-multiline"]) {
    const catalog = projectFixture();
    const steps = catalog.topics[0].pilot.code.steps;
    const base = steps[0];
    const provider = '<slot name="list-item" :item="item" />';
    const consumer =
      crowded === "provider-multiline"
        ? '<List><template\n #list-item="{ item }">{{ item.name }}</template></List>'
        : '<List><template #list-item="{ item }">{{ item.name }}</template></List>';
    const crowdedProvider = crowded.startsWith("provider");
    catalog.topics[0].pilot.code.steps = [
      ...Array.from({ length: 6 }, (_, i) => ({
        ...base,
        path: `src/Crowded${i}.vue`,
        preview: {
          startLine: 1,
          text: crowdedProvider ? provider : consumer,
        },
      })),
      {
        ...base,
        path: "src/ZOtherRole.vue",
        preview: {
          startLine: 1,
          text: crowdedProvider ? consumer : provider,
        },
      },
    ];
    const retrieve = projectDiscussionContext({
      catalog: () => catalog,
      roots: () => [],
      analyses: () => [],
    });
    const materials = await retrieve(
      JSON.stringify({ question: { title: "scoped slots", project: "first" } }),
      "Покажи обе стороны в проекте",
    );
    const fragments = materials.filter((item) => item.id !== "project-search");
    assert.equal(fragments.length, 6);
    assert(
      fragments.some((item) => item.text.includes(provider)),
      crowded,
    );
    assert(
      fragments.some((item) => item.text.includes('#list-item="{ item }"')),
      crowded,
    );
    assert.equal(new Set(fragments.map((item) => item.id)).size, 6);
  }
});

test("scoped slot search includes shorthand consumers and the provider", async () => {
  const catalog = projectFixture();
  const steps = catalog.topics[0].pilot.code.steps;
  steps[0].path = "src/List.vue";
  steps[0].preview = {
    startLine: 1,
    text: '<template><slot name="row" :item="item" /></template>',
  };
  steps.push({
    ...steps[0],
    path: "src/Parent.vue",
    preview: {
      startLine: 1,
      text: '<List>\n<template #row="{ item }">{{ item.name }}</template>\n</List>',
    },
  });
  const retrieve = projectDiscussionContext({
    catalog: () => catalog,
    roots: () => [],
    analyses: () => [],
  });
  const materials = await retrieve(
    JSON.stringify({ question: { title: "scoped slots", project: "first" } }),
    "Покажи обе стороны в проекте",
  );
  assert(materials.some((item) => item.path.includes("List.vue")));
  assert(materials.some((item) => item.text.includes('#row="{ item }"')));
});

test("draft search includes late persistence and explicit save handlers rather than only initial state", async () => {
  const catalog = projectFixture();
  const step = catalog.topics[0].pilot.code.steps[0];
  step.path = "src/form.ts";
  step.preview = {
    startLine: 1,
    text: [
      "const draftStatus = ref('idle');",
      ...Array(110).fill("// other state"),
      "async function persistDraft() {",
      "  await store.saveDraft(form);",
      "}",
      ...Array(110).fill("// other behavior"),
      "async function save() {",
      "  await store.saveEntry(form);",
      "  await store.removeDraft();",
      "}",
    ].join("\n"),
  };
  const retrieve = projectDiscussionContext({
    catalog: () => catalog,
    roots: () => [],
    analyses: () => [],
  });
  const materials = await retrieve(
    JSON.stringify({
      question: { title: "Сохранение черновика", project: "first" },
    }),
    "Покажи в проекте черновик и явное сохранение",
  );
  const text = materials.map((item) => item.text).join("\n");
  assert(text.includes("store.saveDraft(form)"));
  assert(text.includes("store.saveEntry(form)"));
  assert(text.includes("store.removeDraft()"));
});

test("draft search follows store method definitions below initialization", async () => {
  const catalog = projectFixture();
  const step = catalog.topics[0].pilot.code.steps[0];
  step.path = "src/store.ts";
  step.preview = {
    startLine: 1,
    text: [
      "const draftStatus = 'idle';",
      "await store.savePreferences();",
      ...Array(90).fill("// initial values"),
      "await store.saveSettings();",
      ...Array(90).fill("// other actions"),
      "await store.saveProfile();",
      ...Array(90).fill("// more actions"),
      "const actions = {",
      "  async saveEntry(entry: Entry): Promise<Entry> {",
      "    await repository.writeEntry(entry);",
      "    await repository.deleteDraft(entry.date);",
      "    return entry;",
      "  },",
      "  async saveDailyEntryDraft(entry: Entry) {",
      "    return repository.writeDraft(entry);",
      "  }",
      "};",
    ].join("\n"),
  };
  const retrieve = projectDiscussionContext({
    catalog: () => catalog,
    roots: () => [],
    analyses: () => [],
  });
  const text = JSON.stringify(
    await retrieve(
      JSON.stringify({ question: { title: "Черновик", project: "first" } }),
      "Покажи в проекте сохранение черновика и записи",
    ),
  );
  assert(text.includes("repository.writeEntry(entry)"));
  assert(text.includes("repository.writeDraft(entry)"));
});

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
