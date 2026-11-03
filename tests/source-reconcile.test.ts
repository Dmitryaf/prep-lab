import test from "node:test";
import assert from "node:assert/strict";
import { reconcileText } from "../domain/source/reconcile.ts";
test("an external update cannot silently replace a manual edit", () => {
  assert.deepEqual(
    reconcileText(
      "Принятая версия",
      "Ручная правка",
      "Новое содержимое источника",
    ),
    {
      kind: "conflict",
      baseline: "Принятая версия",
      current: "Ручная правка",
      incoming: "Новое содержимое источника",
    },
  );
});

for (const [name, baseline, current, incoming, expected] of [
  [
    "accept an external update when the active text was not edited",
    "Прежний",
    "Прежний",
    "Новый",
    "Новый",
  ],
  [
    "retain a manual edit when the external source is unchanged",
    "Прежний",
    "Ручной",
    "Прежний",
    "Ручной",
  ],
  [
    "accept matching changes without a conflict",
    "Прежний",
    "Одинаковый",
    "Одинаковый",
    "Одинаковый",
  ],
  ["import a new document", null, null, "Первый", "Первый"],
  [
    "propose removal of an unedited deleted source",
    "Прежний",
    "Прежний",
    null,
    null,
  ],
  [
    "retain a manual removal when the source is unchanged",
    "Прежний",
    null,
    "Прежний",
    null,
  ],
] as const) {
  test(name, () =>
    assert.deepEqual(reconcileText(baseline, current, incoming), {
      kind: "automatic",
      markdown: expected,
    }),
  );
}
test("deleting a source with a manual edit requires an explicit choice", () => {
  assert.deepEqual(reconcileText("Прежний", "Ручной", null), {
    kind: "conflict",
    baseline: "Прежний",
    current: "Ручной",
    incoming: null,
  });
});
test("a line-ending-only update retains the manual text byte for byte", () => {
  assert.deepEqual(
    reconcileText("Строка\r\nВторая", "Ручная\nВторая", "Строка\nВторая"),
    { kind: "automatic", markdown: "Ручная\nВторая" },
  );
});
