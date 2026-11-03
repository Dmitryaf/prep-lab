import test from "node:test";
import assert from "node:assert/strict";
import { compileSourceDocument } from "../domain/source/compile.ts";
import type { SourceDocument } from "../domain/source/contracts.ts";
import { supportsQuestion } from "../domain/knowledge/profile.ts";

const markdown =
  "---\ntitle: Проверка входа\naliases: [Граница API]\nfrontendLab:\n  category: TypeScript\n---\n# Проверка входа\n\n## Что проверяет TypeScript?\n\n**Критерии ответа:** Различаю статическую проверку и проверку входа при выполнении.\n\n> [!answer]- Ответ\n> TypeScript проверяет типы до выполнения. Для внешних данных нужна отдельная проверка значений.\n";
const original: SourceDocument = {
  id: "source-a/material/one",
  sourceId: "source-a",
  path: "Своя база/Вход.md",
  kind: "theory",
  profile: "shared",
  sourceMarkdown: markdown,
  markdown,
  aliases: [],
  questionKeys: {},
};
const sequence = () => {
  let id = 0;
  return () => String(++id);
};

test("an ordinary Markdown path produces a usable material and namespaced question", () => {
  const compiled = compileSourceDocument(original, undefined, sequence());
  assert(compiled.note);
  assert.equal(compiled.note.id, "source-a/material/one");
  assert.equal(compiled.note.title, "Проверка входа");
  assert.deepEqual(compiled.note.aliases, ["Граница API"]);
  assert.equal(compiled.questions.length, 1);
  assert.equal(compiled.questions[0].id, "source-a/question/1");
  assert.equal(compiled.questions[0].category, "TypeScript");
  assert.equal(
    compiled.document.questionKeys["Что проверяет TypeScript?"],
    "source-a/question/1",
  );
});
test("renaming a question without changing its body retains the question identity and old anchor", () => {
  const previous = compileSourceDocument(
    original,
    undefined,
    sequence(),
  ).document;
  const next = {
    ...previous,
    markdown: markdown.replace(
      "## Что проверяет TypeScript?",
      "## Где проходит граница типов?",
    ),
  };
  const compiled = compileSourceDocument(
    next,
    previous,
    () => "unexpected-new-id",
  );
  assert.equal(compiled.questions[0]?.id, "source-a/question/1");
  assert.equal(
    compiled.note?.headingAliases?.["Что проверяет TypeScript?"],
    "Где проходит граница типов?",
  );
});
test("a changed question can explicitly retain its identity through a heading match", () => {
  const previous = compileSourceDocument(
    original,
    undefined,
    sequence(),
  ).document;
  const next = {
    ...previous,
    markdown: markdown
      .replace("Что проверяет TypeScript?", "Как проверить внешний ответ?")
      .replace(
        "TypeScript проверяет типы до выполнения.",
        "Ответ сервера нужно проверить перед использованием.",
      ),
  };
  const compiled = compileSourceDocument(next, previous, () => "unexpected", {
    "Как проверить внешний ответ?": "Что проверяет TypeScript?",
  });
  assert.equal(compiled.questions[0]?.id, "source-a/question/1");
  assert.throws(() =>
    compileSourceDocument(next, previous, sequence(), {
      "Как проверить внешний ответ?": "Неизвестный вопрос",
    }),
  );
});
test("a copied question does not steal the identity of an existing updated question", () => {
  const previous = compileSourceDocument(
    original,
    undefined,
    sequence(),
  ).document;
  const copied = markdown
    .slice(markdown.indexOf("## "))
    .replace("## Что проверяет TypeScript?", "## Копия вопроса");
  const changed = markdown.replace(
    "TypeScript проверяет типы до выполнения.",
    "Статическая проверка не проверяет ответ сервера.",
  );
  const compiled = compileSourceDocument(
    {
      ...previous,
      markdown:
        "# Материал\n\n" +
        copied +
        "\n\n" +
        changed.slice(changed.indexOf("## ")),
    },
    previous,
    () => "new",
  );
  assert.equal(compiled.questions[0]?.id, "source-a/question/new");
  assert.equal(compiled.questions[1]?.id, "source-a/question/1");
});
test("duplicate question anchors cannot be accepted as two independent identities", () => {
  const question = markdown.slice(markdown.indexOf("## "));
  assert.throws(
    () =>
      compileSourceDocument(
        { ...original, markdown: "# Материал\n" + question + "\n" + question },
        undefined,
        sequence(),
      ),
    /повтор/i,
  );
});
test("reference-only and removed documents never fabricate interview questions", () => {
  const reference = compileSourceDocument(
    { ...original, kind: "reference" },
    undefined,
    sequence(),
  );
  assert(reference.note);
  assert.equal(reference.questions.length, 0);
  const removed = compileSourceDocument(
    { ...original, markdown: null },
    original,
    sequence(),
  );
  assert.equal(removed.note, undefined);
  assert.deepEqual(removed.questions, []);
});
test("explicit stack scope also protects a generic question without framework keywords", () => {
  const compiled = compileSourceDocument(
    { ...original, profile: "vue" },
    undefined,
    sequence(),
  );
  assert(compiled.questions[0]);
  assert.equal(supportsQuestion(compiled.questions[0], "react"), false);
  assert.deepEqual(compiled.note?.profiles, ["vue"]);
});
