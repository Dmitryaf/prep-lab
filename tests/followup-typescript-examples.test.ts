import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";

const answers = loadCommonKnowledge().questions.flatMap(
  (question) => question.followupAnswers || [],
);
const titles = [
  "Что проверяет satisfies и чего он не делает во время исполнения?",
  "Как `never` помогает заметить новый необработанный вариант объединения?",
  "Как ограничить ключ параметром K extends keyof T?",
  "Когда условный тип распределяется по union и как отключить это поведение?",
  "Как кортеж для rest-параметров сохраняет связь между аргументами?",
  "Какой результат даст ReturnType для перегруженной функции?",
  "Что даёт as const и замораживает ли оно данные во время выполнения?",
];
function example(title: string) {
  const answer = answers.find((item) => item.title === title)?.answer;
  const code = answer?.match(/~~~ts\n([\s\S]*?)\n~~~/)?.[1];
  assert(code, `Missing published TypeScript example: ${title}`);
  return code;
}
function diagnostics(code: string) {
  const filename = resolve("published-followup-examples.ts").replaceAll(
    "\\",
    "/",
  );
  const options: ts.CompilerOptions = {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version, onError, createNew) =>
    file === filename
      ? ts.createSourceFile(file, code, ts.ScriptTarget.ES2022, true)
      : getSourceFile(file, version, onError, createNew);
  return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
}
const combined = () =>
  titles
    .map((title, index) => `namespace Example${index} {\n${example(title)}\n}`)
    .join("\n");

test("published TypeScript examples compile with their documented expected errors", () => {
  assert.deepEqual(
    diagnostics(combined()).map((item) =>
      ts.flattenDiagnosticMessageText(item.messageText, "\n"),
    ),
    [],
  );
});

test("removing expected-error directives exposes the seven actual type violations", () => {
  const code = combined().replace(/^.*@ts-expect-error.*$/gm, "");
  assert.deepEqual(
    diagnostics(code)
      .map((item) => item.code)
      .sort(),
    [2322, 2322, 2322, 2322, 2345, 2345, 2540],
  );
});

test("adding a state to the published union breaks its exhaustive switch", () => {
  const code = example(titles[1]!).replace(
    "type Result =",
    "type Result = { status: 'pending' } |",
  );
  const errors = diagnostics(code);
  assert.deepEqual(
    errors.map((item) => item.code),
    [2322],
  );
  assert.match(
    ts.flattenDiagnosticMessageText(errors[0]!.messageText, "\n"),
    /never/,
  );
});

test("the published const assertion leaves an existing array mutable at runtime", () => {
  const output = ts.transpileModule(example(titles[6]!), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const log: unknown[] = [];
  runInNewContext(
    output,
    { console: { log: (value: unknown) => log.push(value) } },
    { timeout: 1000 },
  );
  assert.deepEqual(log, [3]);
});
