import test from "node:test";
import assert from "node:assert/strict";
import { projectFixture } from "#tests/fixtures/projects.ts";
import {
  projectMapDiagram,
  layoutProjectMap,
  projectMapSchema,
  type ProjectMap,
} from "#domain/projects/map.ts";

test("legacy project maps use owned topics, stack and exact code references", () => {
  const catalog = projectFixture(),
    project = catalog.projects.first;
  const scenarios = projectMapDiagram(project, catalog.topics, "scenarios");
  assert.deepEqual(
    scenarios.nodes.flatMap((node) => node.topicIds),
    ["first-main", "first-storage", "first-errors"],
  );
  assert(
    scenarios.nodes.every(
      (node) => !node.topicIds.some((id) => id.startsWith("second-")),
    ),
  );
  assert(scenarios.edges.every((edge) => edge.kind === "contains"));
  const technology = projectMapDiagram(project, catalog.topics, "technologies");
  assert.deepEqual(
    technology.nodes
      .filter((node) => node.kind === "technology")
      .map((node) => node.label),
    ["TypeScript"],
  );
  const typescript = technology.nodes.find(
    (node) => node.kind === "technology",
  )!;
  assert.match(typescript.description, /структуру данных/);
  assert(typescript.topicIds.includes("first-main"));
  assert(typescript.topicIds.every((id) => id.startsWith("first-")));
  assert.equal(technology.edges[0].label, "Используется в проекте");
  const structure = projectMapDiagram(project, catalog.topics, "structure");
  const files = structure.nodes.filter((node) => node.codeReferences?.length);
  assert.equal(files.length, 1);
  assert.equal(files[0].label, "Сценарии");
  assert.equal(files[0].codeReferences?.length, 1);
  assert.deepEqual(files[0].topicIds, [
    "first-main",
    "first-storage",
    "first-errors",
  ]);
  assert(structure.edges.every((edge) => edge.kind === "contains"));
  assert.equal(
    structure.nodes.filter((node) => node.kind === "system").length,
    1,
  );
  assert.equal(structure.edges[0].from, "project:first");
});

test("technology explanations link actual mentions without substring matches or unrelated projects", () => {
  const catalog = projectFixture();
  catalog.projects.first.stack = ["Vue 3", "Vuex", "Pinia"];
  catalog.topics[0].mechanism = [
    "Pinia сохраняет выбранный фильтр между экранами.",
  ];
  catalog.topics[1].summary = "Vuex хранит состояние карточки.";
  catalog.topics[2].summary = "Независимый сценарий.";
  const map = projectMapDiagram(
    catalog.projects.first,
    catalog.topics,
    "technologies",
  );
  const pinia = map.nodes.find((node) => node.label === "Pinia")!;
  assert.match(pinia.description, /выбранный фильтр/);
  assert.deepEqual(pinia.topicIds, ["first-main"]);
  assert.deepEqual(
    map.nodes.find((node) => node.label === "Vue 3")!.topicIds,
    [],
  );
  assert.deepEqual(map.nodes.find((node) => node.label === "Vuex")!.topicIds, [
    "first-storage",
  ]);
});

test("semantic blocks keep code from each repository without making file nodes", () => {
  const catalog = projectFixture();
  catalog.topics[1].pilot.code.steps = [
    { ...catalog.topics[1].pilot.code.steps[0], project: "service" },
  ];
  const map = projectMapDiagram(
    catalog.projects.first,
    catalog.topics,
    "structure",
  );
  assert.equal(map.nodes.length, 2);
  assert.deepEqual(
    map.nodes[1].codeReferences?.map((ref) => ref.project),
    ["first", "service"],
  );
  assert(map.nodes.every((node) => !node.id.startsWith("file:")));
});

test("structure preserves responsibilities and related code without scenario or technology clutter", () => {
  const catalog = projectFixture();
  const project = catalog.projects.first;
  project.map = {
    nodes: [
      {
        id: "form",
        kind: "scenario",
        label: "Сохранить",
        description: "Форма",
        topicIds: ["first-main"],
      },
      {
        id: "data",
        kind: "module",
        label: "Данные",
        description: "Хранение записей",
        topicIds: ["first-storage"],
      },
      {
        id: "ts",
        kind: "technology",
        label: "TypeScript",
        description: "Типы",
        topicIds: [],
      },
    ],
    edges: [
      { from: "form", to: "data", kind: "flow", label: "Сохраняет" },
      { from: "data", to: "ts", kind: "uses", label: "Описывает типы" },
    ],
  };
  const diagram = projectMapDiagram(project, catalog.topics, "structure");
  assert.deepEqual(
    diagram.nodes.map((node) => node.id),
    ["project:first", "data"],
  );
  assert.equal(diagram.nodes[1].codeReferences?.[0].path, "src/example.ts");
  project.structure = {
    nodes: [
      {
        id: "custom",
        kind: "module",
        label: "Рабочие данные",
        description: "Данные формы",
        topicIds: ["first-main"],
      },
    ],
    edges: [],
  };
  assert(
    projectMapDiagram(project, catalog.topics, "structure").nodes.some(
      (n) => n.id === "custom",
    ),
  );
  assert(
    projectMapDiagram(project, catalog.topics, "scenarios").nodes.some(
      (n) => n.id === "form",
    ),
  );
  const layout = layoutProjectMap(
    projectMapDiagram(project, catalog.topics, "structure"),
    true,
  );
  assert(layout.width <= 560 && layout.height < 560);
});

test("authored relationships show where a technology is used without attaching it to every scenario", () => {
  const catalog = projectFixture();
  const map: ProjectMap = {
    nodes: [
      {
        id: "save",
        label: "Сохранение",
        kind: "scenario",
        description: "Сохранить заметку",
        topicIds: ["first-main"],
      },
      {
        id: "store",
        label: "Хранилище заметок",
        kind: "module",
        description: "Состояние заметок",
        topicIds: ["first-storage"],
      },
      {
        id: "pinia",
        label: "Pinia",
        kind: "technology",
        description: "Хранение состояния",
        topicIds: [],
      },
      {
        id: "other",
        label: "Другое действие",
        kind: "scenario",
        description: "Независимый сценарий",
        topicIds: ["first-errors"],
      },
    ],
    edges: [
      { from: "save", to: "store", label: "Записывает заметку", kind: "flow" },
      {
        from: "store",
        to: "pinia",
        label: "Хранит состояние через",
        kind: "uses",
      },
    ],
  };
  const technology = projectMapDiagram(
    { ...catalog.projects.first, map },
    catalog.topics,
    "technologies",
  );
  assert(technology.nodes.some((node) => node.id === "store"));
  assert(
    !technology.nodes.some((node) => node.id === "save" || node.id === "other"),
  );
  assert(
    technology.edges.some(
      (edge) => edge.from === "store" && edge.to === "pinia",
    ),
  );
  assert(
    !technology.edges.some(
      (edge) => edge.from === "pinia" && edge.to === "other",
    ),
  );
});

test("map validation rejects ambiguous identities and broken relationships", () => {
  const node = {
    id: "one",
    label: "Узел",
    kind: "module",
    description: "",
    topicIds: [],
  };
  assert.equal(
    projectMapSchema.safeParse({ nodes: [node, node], edges: [] }).success,
    false,
  );
  for (const to of ["missing", "one"])
    assert.equal(
      projectMapSchema.safeParse({
        nodes: [node],
        edges: [{ from: "one", to, label: "Связь", kind: "flow" }],
      }).success,
      false,
    );
});

test("an authored system is reused instead of adding a second project root", () => {
  const catalog = projectFixture();
  const map: ProjectMap = {
    nodes: [
      {
        id: "system",
        label: catalog.projects.first.name,
        kind: "system",
        description: "Система",
        topicIds: [],
      },
      {
        id: "form",
        label: "Форма",
        kind: "module",
        description: "Ввод данных",
        topicIds: ["first-main"],
      },
    ],
    edges: [
      { from: "system", to: "form", label: "Содержит", kind: "contains" },
    ],
  };
  const diagram = projectMapDiagram(
    { ...catalog.projects.first, map },
    catalog.topics,
    "structure",
  );
  assert.deepEqual(
    diagram.nodes.map((node) => node.id),
    ["system", "form"],
  );
  assert.equal(diagram.edges.length, 1);
});

test("diagram layout stays finite for cycles and separates nodes in the same column", () => {
  const nodes = ["one", "two", "three"].map((id) => ({
    id,
    label: id,
    kind: "module" as const,
    description: "",
    topicIds: [],
  }));
  const layout = layoutProjectMap({
    nodes,
    edges: [
      { from: "one", to: "two", kind: "flow", label: "next" },
      { from: "two", to: "one", kind: "flow", label: "back" },
      { from: "one", to: "three", kind: "contains", label: "part" },
    ],
  });
  assert(
    layout.nodes.every(
      (node) => Number.isFinite(node.x) && Number.isFinite(node.y),
    ),
  );
  assert(layout.edges.every((edge) => !edge.path.includes("NaN")));
  const second = layout.nodes.find((node) => node.id === "two")!,
    third = layout.nodes.find((node) => node.id === "three")!;
  assert.equal(second.x, third.x);
  assert(Math.abs(second.y - third.y) >= 84);
});

test("eight responsibility blocks fit the overview and connections stay between columns", () => {
  const nodes = [
    "root",
    ...Array.from({ length: 8 }, (_, i) => "block" + i),
  ].map((id) => ({
    id,
    label: id,
    kind: "module" as const,
    description: "",
    topicIds: [],
  }));
  const layout = layoutProjectMap(
    {
      nodes,
      edges: [
        { from: "block0", to: "block4", kind: "flow", label: "Сохраняет" },
      ],
    },
    true,
  );
  assert(layout.height <= 560);
  assert(layout.nodes.every((node) => node.y + 84 <= 560));
  assert.equal(layout.edges[0].path, "M 244 182 H 279 V 390 H 244");
});

test("compact root links follow the central corridor instead of crossing other modules", () => {
  const nodes = ["root", "first", "second", "third"].map((id) => ({
    id,
    label: id,
    kind: "module" as const,
    description: "",
    topicIds: [],
  }));
  const result = layoutProjectMap(
    {
      nodes,
      edges: [{ from: "root", to: "third", kind: "contains", label: "part" }],
    },
    true,
  );
  assert.equal(result.edges[0].path, "M 279 108 V 286 H 244");
});
