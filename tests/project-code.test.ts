import test from "node:test";
import assert from "node:assert/strict";
import { codePreview, codePresentation } from "#domain/projects/code.ts";
import { projectFromDraft } from "#domain/projects/from-draft.ts";
import { projectDraftFixture } from "#tests/fixtures/project-draft.ts";

test("project acceptance stores the original code and line numbers outside the explanation", () => {
  const draft = structuredClone(projectDraftFixture);
  draft.roleFacts = [];
  draft.topics[0].codeReferences = [
    {
      sourceId: "file",
      startLine: 2,
      endLine: 3,
      explanation: "Сохраняет введённое имя.",
    },
  ];
  let sequence = 0;
  const result = projectFromDraft(
    draft,
    {
      profile: "vue",
      request: "Разобрать",
      context: "",
      materials: [
        {
          id: "file",
          path: "src/save.ts",
          text: "// header\r\nconst name = input.name;\r\nreturn save(name);",
        },
      ],
    },
    () => String(++sequence),
  );
  const step = result.catalog.topics[0].pilot.code.steps[0];
  assert.deepEqual(step.preview, {
    text: "const name = input.name;\nreturn save(name);",
    startLine: 2,
  });
  assert.equal(step.explanation, "Сохраняет введённое имя.");
});

test("legacy embedded fragments open in the same viewer and extraction has a bounded size", () => {
  assert.deepEqual(
    codePresentation({
      explanation:
        "Пояснение\n\nПереданный фрагмент:\n\n```text\nconst value = 1;\n```",
      line: 12,
    }),
    {
      explanation: "Пояснение",
      preview: { text: "const value = 1;", startLine: 12 },
    },
  );
  assert.equal(
    codePreview("line\n".repeat(500), 10, 450).text.split("\n").length,
    200,
  );
});
