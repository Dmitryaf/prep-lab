import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolve } from "node:path";
import ts from "typescript";

const root = "content/common/";
function example(path: string, marker: string) {
  const text = readFileSync(root + path, "utf8").replace(/^> ?/gm, "");
  const block = [...text.matchAll(/```(?:js|ts|jsx|tsx)\n([\s\S]*?)```/g)].find(
    (match) => match[1]?.includes(`// checked-example: ${marker}`),
  );
  assert(block, `Missing published example ${marker}`);
  return block[1]!;
}

test("published leading/trailing throttle keeps last args/receiver, spacing and cancellation", () => {
  const source = example(
    "Фронтенд/JavaScript/05. Асинхронность/07. Debounce и throttle.md",
    "throttle-leading-trailing",
  );
  const result = vm.runInNewContext(`${source}
    let now = 0, id = 0;
    const timers = new Map(), calls = [];
    const performance = { now: () => now };
    const setTimeout = (fn, delay) => { timers.set(++id, {fn, at: now + delay}); return id; };
    const clearTimeout = id => timers.delete(id);
    const advance = time => {
      while (true) {
        const entry = [...timers].filter(([, t]) => t.at <= time).sort((a,b) => a[1].at-b[1].at)[0];
        if (!entry) break;
        now = entry[1].at; timers.delete(entry[0]); entry[1].fn();
      }
      now = time;
    };
    const f = throttleTrailing(function(value) { calls.push([now, this.id, value]); }, 100);
    f.call({id: 1}, 'A'); advance(20); f.call({id: 2}, 'B');
    advance(70); f.call({id: 3}, 'C'); advance(130); f.call({id: 4}, 'D');
    advance(250); f.call({id: 5}, 'cancelled'); f.cancel();
    advance(260); f.call({id: 6}, 'E'); advance(500);
    let invalid = false; try { throttleTrailing(() => {}, 0); } catch { invalid = true; }
    JSON.stringify({ calls, timers: timers.size, invalid });
  `);
  assert.equal(
    result,
    JSON.stringify({
      calls: [
        [0, 1, "A"],
        [100, 3, "C"],
        [200, 4, "D"],
        [260, 6, "E"],
      ],
      timers: 0,
      invalid: true,
    }),
  );
});

test("published curry branches independently, respects arity and final receiver", () => {
  const source = example(
    "Фронтенд/JavaScript/13. Функциональные паттерны/02. Currying, partial application, memoization и decorators.md",
    "curry-arity",
  );
  const result = vm.runInNewContext(
    `${source}
    const fn = curry(function(a, b, c) { return this.base + a + b + c; });
    const part = fn(1);
    const target = { base: 10 };
    const values = [part(2).call(target, 3), part.call(target, 5, 6), add3(1)(2,3), add3(1,2,3,999)];
    const rest = curry((...args) => args.join(','), 2);
    values.push(rest('a')()('b'), curry(() => 7, 0)());
    JSON.stringify(values);
  `,
    { console: { log() {} } },
  );
  assert.equal(result, '[16,22,6,6,"a,b",7]');
});

function diagnostics(source: string) {
  const filename = resolve("published-research.ts").replaceAll("\\", "/");
  const options: ts.CompilerOptions = {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
  };
  const host = ts.createCompilerHost(options),
    original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version, onError, createNew) =>
    file === filename
      ? ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true)
      : original(file, version, onError, createNew);
  return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
}

test("published Promise.all preserves tuple types and rejects a wrong position", () => {
  const source = example(
    "Собеседования/Практика/TypeScript.md",
    "typed-promise-all",
  );
  assert.deepEqual(
    diagnostics(source).map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    ),
    [],
  );
  assert.equal(
    diagnostics(source.replace(/^.*@ts-expect-error.*$/gm, "")).length,
    1,
  );
});

test("published typed Promise.all handles order, sparse arrays, values and rejection", async () => {
  const source = ts.transpileModule(
    example("Собеседования/Практика/TypeScript.md", "typed-promise-all"),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  const result = await vm.runInNewContext(`${source}
    (async () => {
      let finish; const slow = new Promise(resolve => { finish = resolve; });
      const result = allTyped([slow, Promise.resolve('fast'), 3]); finish('slow');
      const order = await result, sparse = await allTyped(new Array(2)), empty = await allTyped([]);
      let failure; try { await allTyped([Promise.reject(new Error('failed')), 2]); } catch(error) { failure = error.message; }
      const thenable = await allTyped([{then(resolve) { resolve(8); }}]);
      return JSON.stringify({ order, sparse, empty, failure, thenable });
    })();
  `);
  assert.equal(
    result,
    '{"order":["slow","fast",3],"sparse":[null,null],"empty":[],"failure":"failed","thenable":[8]}',
  );
});
