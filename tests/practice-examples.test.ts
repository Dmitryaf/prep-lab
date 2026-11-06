import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";

const common = loadCommonKnowledge();
function example(title: string, name: string) {
  const question = common.questions.find((entry) => entry.title === title)!;
  assert(question?.availableAnswer, `Missing worked solution: ${title}`);
  assert(
    question.criteria && question.learningLinks.length,
    `No self-check route: ${title}`,
  );
  const block = [
    ...question.answer.matchAll(/```(?:js|ts)\n([\s\S]*?)```/g),
  ].find((match) => match[1].includes(`// checked-example: ${name}`));
  assert(block, `Missing executable example: ${name}`);
  return block[1];
}
function evaluate(code: string, expression: string) {
  const javascript = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(
    javascript + "\n" + expression,
    {},
    { timeout: 3000 },
  );
}

test("RLE solution handles the final run, singleton runs and invalid input", () => {
  const code = example("RLE-сжатие строки", "rle");
  assert.equal(
    evaluate(code, `encodeRuns('AABBBCCXYZDDDDEEEFFF')`),
    "A2B3C2XYZD4E3F3",
  );
  assert.equal(evaluate(code, `encodeRuns('')`), "");
  assert.equal(evaluate(code, `encodeRuns('AB')`), "AB");
  assert.equal(evaluate(code, `encodeRuns('A'.repeat(12))`), "A12");
  assert.throws(() => evaluate(code, `encodeRuns('Ab')`), /A–Z/);
  assert.throws(() => evaluate(code, `encodeRuns('A\\n')`), /A–Z/);
});

test("sliding window never moves its left edge backwards and counts code points", () => {
  const code = example("Самая длинная подстрока без повторов", "unique-window");
  for (const [input, expected] of [
    ["", 0],
    ["abba", 2],
    ["abcabcbb", 3],
    ["😀a😀b", 3],
    ["aaaa", 1],
  ] as const) {
    assert.equal(
      evaluate(code, `longestUnique(${JSON.stringify(input)})`),
      expected,
    );
  }
});

test("LRU reads and writes refresh recency; misses and zero capacity do not", () => {
  const code = example("Кэш LRU с ограниченной ёмкостью", "lru");
  assert.equal(
    evaluate(
      code,
      `(() => {
    const cache = new LRUCache(2);
    cache.put('a', 1); cache.put('b', 2); cache.get('a'); cache.put('c', 3);
    return JSON.stringify([cache.get('b'), cache.get('a'), cache.get('c')]);
  })()`,
    ),
    '[{"found":false},{"found":true,"value":1},{"found":true,"value":3}]',
  );
  assert.equal(
    evaluate(
      code,
      `(() => {
    const cache = new LRUCache(2);
    cache.put('a', 1); cache.put('b', 2); cache.put('a', 10); cache.get('missing'); cache.put('c', 3);
    return JSON.stringify([cache.get('b'), cache.get('a')]);
  })()`,
    ),
    '[{"found":false},{"found":true,"value":10}]',
  );
  assert.equal(
    evaluate(
      code,
      `(() => { const cache = new LRUCache(0); cache.put('x', 1); return cache.get('x').found; })()`,
    ),
    false,
  );
  assert.equal(
    evaluate(
      code,
      `(() => { const cache = new LRUCache(1); cache.put(NaN, undefined); return cache.get(NaN).found; })()`,
    ),
    true,
  );
  assert.throws(() => evaluate(code, `new LRUCache(-1)`), /capacity/);
});

test("tree indexing preserves node identity, handles depth, and rejects ambiguity", () => {
  const code = example("Индекс по идентификатору", "tree-index");
  assert.equal(
    evaluate(
      code,
      `(() => {
    const leaf = {id: 'leaf'}, root = {id: 'root', children: [leaf]};
    const index = indexTree(root);
    return index.size === 2 && index.get('leaf') === leaf && root.children[0] === leaf;
  })()`,
    ),
    true,
  );
  assert.equal(
    evaluate(
      code,
      `(() => {
    let root = {id: 0};
    for (let id = 1; id < 12000; id++) root = {id, children: [root]};
    return indexTree(root).size;
  })()`,
    ),
    12000,
  );
  assert.throws(
    () => evaluate(code, `indexTree({id: 'same', children: [{id: 'same'}]})`),
    /Duplicate/,
  );
  assert.throws(
    () =>
      evaluate(
        code,
        `(() => { const node = {id: 1, children: []}; node.children.push(node); return indexTree(node); })()`,
      ),
    /Cycle|Repeated/,
  );
});

test("typed menu solution groups without ordering assumptions or prototype collisions", () => {
  const code = example("Типизация меню в reduce", "typed-menu");
  assert.equal(
    evaluate(
      code,
      `JSON.stringify(buildMenu(['guide/b', 'guide', 'guide/a', 'other']))`,
    ),
    '{"guide":["b","a"],"other":[]}',
  );
  assert.equal(
    evaluate(
      code,
      `(() => { const input = ['b/one', 'a/two']; buildMenu(input); return input.join(','); })()`,
    ),
    "b/one,a/two",
  );
  assert.equal(
    evaluate(code, `buildMenu(['__proto__/safe'])['__proto__'][0]`),
    "safe",
  );
  assert.throws(() => evaluate(code, `buildMenu(['a/b/c'])`), /path/);
  const file = "typed-menu-example.ts";
  const source =
    code +
    '\nconst result: Record<string, string[]> = buildMenu(["guide/a"]);\n// @ts-expect-error paths must be strings\nbuildMenu([1]);\n';
  const host = ts.createCompilerHost({});
  const originalRead = host.readFile.bind(host),
    originalExists = host.fileExists.bind(host);
  host.readFile = (path) => (path === file ? source : originalRead(path));
  host.fileExists = (path) => path === file || originalExists(path);
  const program = ts.createProgram(
    [file],
    {
      strict: true,
      noUncheckedIndexedAccess: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
      skipLibCheck: true,
    },
    host,
  );
  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    [],
  );
});
