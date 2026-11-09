import test from "node:test";
import assert from "node:assert/strict";
import { projectFixture } from "./fixtures/projects.ts";
import {
  mapRelations,
  mapMaterials,
  scenarioDiagram,
} from "#domain/projects/map-presentation.ts";
import { projectFromDraft } from "#domain/projects/from-draft.ts";
import { projectDraftFixture } from "./fixtures/project-draft.ts";

test("inspector lists only neighbours, groups directions and removes duplicate relations and code", () => {
  const catalog = projectFixture();
  const nodes = [
    {
      id: "root",
      label: "Пример",
      kind: "system" as const,
      description: "",
      topicIds: [],
    },
    ...["selected", "before", "after"].map((id) => ({
      id,
      label: id,
      kind: "scenario" as const,
      description: "",
      topicIds: ["first-main"],
    })),
  ];
  const incoming = {
    from: "before",
    to: "selected",
    label: "Открыть",
    kind: "flow" as const,
  };
  const groups = mapRelations(
    {
      nodes,
      edges: [
        { from: "root", to: "selected", label: "Включает", kind: "contains" },
        incoming,
        incoming,
        { from: "selected", to: "after", label: "Перейти", kind: "flow" },
      ],
    },
    nodes[1],
    "scenarios",
    "Пример",
  );
  assert.deepEqual(
    groups.map((g) => [g.title, g.items.map((i) => i.node.id)]),
    [
      ["Перейти из", ["before"]],
      ["Перейти дальше", ["after"]],
    ],
  );
  const materials = mapMaterials(
    { ...nodes[1], codeReferences: catalog.topics[0].pilot.code.steps },
    catalog.topics,
  );
  assert.equal(materials.references.length, 1);
});

test("accepted scenario steps preserve topic identity, order and validation", () => {
  const draft = structuredClone(projectDraftFixture);
  draft.roleFacts = [];
  draft.map = {
    nodes: [
      {
        id: "save",
        label: "Сохранение",
        kind: "scenario",
        description: "Сохраняет форму",
        topicIndexes: [0],
        steps: [
          {
            id: "input",
            label: "Ввод",
            description: "Принять данные",
            topicIndexes: [0],
          },
          {
            id: "save",
            label: "Запись",
            description: "Сохранить данные",
            topicIndexes: [0],
          },
        ],
      },
    ],
    edges: [],
  };
  let id = 0;
  const { catalog } = projectFromDraft(
    draft,
    { profile: "vue", request: "Разбор", context: "", materials: [] },
    () => String(++id),
  );
  const node = Object.values(catalog.projects)[0].map!.nodes[0];
  assert.deepEqual(
    node.steps?.map((step) => step.topicIds),
    [[catalog.topics[0].id], [catalog.topics[0].id]],
  );
  const diagram = scenarioDiagram(node);
  assert.equal(diagram.edges[0].from, "save/step/input");
  assert.equal(diagram.edges[0].to, "save/step/save");
  draft.map.nodes[0].steps![0].topicIndexes = [10];
  assert.throws(
    () =>
      projectFromDraft(
        draft,
        { profile: "vue", request: "", context: "", materials: [] },
        () => "new",
      ),
    /неизвестную тему/,
  );
});
