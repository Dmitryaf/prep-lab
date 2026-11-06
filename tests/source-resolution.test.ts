import test from "node:test";
import assert from "node:assert/strict";
import { resolveSourcePlan } from "#domain/source/resolve.ts";
import type { SourcePlanEntry } from "#domain/source/contracts.ts";

const conflict: SourcePlanEntry = {
  id: "source-a/material/one",
  sourceId: "source-a",
  path: "Тема.md",
  kind: "theory",
  profile: "shared",
  aliases: [],
  questionKeys: { Вопрос: "source-a/question/one" },
  baseline: "Принятый источник",
  current: "Ручная правка",
  incoming: "Новый источник",
  status: "conflict",
};
test("an unresolved conflict cannot become an accepted material", () => {
  assert.throws(() => resolveSourcePlan([conflict], {}), /конфликт/i);
});
test("keeping a manual edit still advances the accepted source baseline", () => {
  const [accepted] = resolveSourcePlan([conflict], {
    [conflict.id]: { choice: "current" },
  });
  assert(accepted);
  assert.equal(accepted.sourceMarkdown, "Новый источник");
  assert.equal(accepted.markdown, "Ручная правка");
  assert.deepEqual(accepted.questionKeys, { Вопрос: "source-a/question/one" });
  assert.equal(conflict.baseline, "Принятый источник");
});
for (const [choice, expected] of [
  ["incoming", "Новый источник"],
  ["remove", null],
] as const) {
  test(`explicit ${choice} resolution records the selected active text`, () => {
    const [accepted] = resolveSourcePlan([conflict], {
      [conflict.id]: { choice },
    });
    assert(accepted);
    assert.equal(accepted.markdown, expected);
  });
}
test("an edited resolution retains its exact text and the external baseline", () => {
  const [accepted] = resolveSourcePlan([conflict], {
    [conflict.id]: { choice: "edited", markdown: "Согласованная правка\n" },
  });
  assert(accepted);
  assert.equal(accepted.markdown, "Согласованная правка\n");
  assert.equal(accepted.sourceMarkdown, "Новый источник");
});
test("a resolution cannot introduce a material absent from the preview", () => {
  assert.throws(() =>
    resolveSourcePlan([], { foreign: { choice: "edited", markdown: "Текст" } }),
  );
});
test("an automatic removal remains a real removal rather than an absent proposal", () => {
  const entry: SourcePlanEntry = {
    ...conflict,
    status: "removed",
    proposed: null,
    incoming: null,
    current: "Принятый источник",
  };
  const [accepted] = resolveSourcePlan([entry], {});
  assert(accepted);
  assert.equal(accepted.markdown, null);
  assert.equal(accepted.sourceMarkdown, null);
});
