import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";

const common = loadCommonKnowledge();
function example(title: string, marker: string) {
  const question = common.questions.find((item) => item.title === title);
  assert(question?.availableAnswer, `Missing solution: ${title}`);
  const block = [
    ...question.answer.matchAll(/```(?:js|ts)\n([\s\S]*?)```/g),
  ].find((match) => match[1].includes(`// checked-example: ${marker}`));
  assert(block, `Missing executable example: ${marker}`);
  return block[1];
}
function run(code: string, scenario: string, globals = {}) {
  return vm.runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText +
      "\n" +
      scenario,
    globals,
    { timeout: 3000 },
  );
}
function typecheck(code: string) {
  const file = "coding-short-example.ts";
  const host = ts.createCompilerHost({});
  const read = host.readFile.bind(host),
    exists = host.fileExists.bind(host);
  host.readFile = (path) => (path === file ? code : read(path));
  host.fileExists = (path) => path === file || exists(path);
  const program = ts.createProgram(
    [file],
    {
      strict: true,
      exactOptionalPropertyTypes: true,
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
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")),
    [],
  );
}

test("debounce waits after the latest call, keeps arguments and receiver, and can be reused", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const events: string[] = [];
  const debounced = run(
    example("Debounce", "debounce"),
    "debounce(function(a, b) { record(this.name + ':' + (a + b)); }, 100)",
    {
      setTimeout,
      clearTimeout,
      record: (event: string) => events.push(event),
    },
  );
  debounced.call({ name: "first" }, 1, 2);
  t.mock.timers.tick(60);
  debounced.call({ name: "last" }, 3, 4);
  t.mock.timers.tick(99);
  assert.deepEqual(events, []);
  t.mock.timers.tick(1);
  assert.deepEqual(events, ["last:7"]);
  debounced.call({ name: "again" }, 0, 2);
  t.mock.timers.tick(100);
  assert.deepEqual(events, ["last:7", "again:2"]);
});

test("getter retains property-specific types and rejects missing keys", () => {
  const code = example("Тип результата getValue", "typed-getter");
  typecheck(
    code +
      `
const object = { count: 1, enabled: false, label: 'ok' };
const count: number = getValue(object, 'count');
const enabled: boolean = getValue(object, 'enabled');
// @ts-expect-error incorrect key
getValue(object, 'missing');
// @ts-expect-error result must not be any or string
const wrong: string = getValue(object, 'count');
`,
  );
  assert.equal(run(code, "getValue({ value: 0 }, 'value')"), 0);
});

test("optional fields and asynchronous result types preserve required values", () => {
  typecheck(example("Необязательные поля, кроме выбранных", "optional-except"));
  typecheck(
    example(
      "Тип результата асинхронной функции, которую нельзя менять",
      "async-result",
    ) +
      `
const user: User = { name: 'A', age: 2 };
// @ts-expect-error resolved User is not a Promise
const pending: User = Promise.resolve(user);
// @ts-expect-error property type is retained
const invalid: User = { name: 'A', age: '2' };
`,
  );
});

test("circle guard rejects null, arrays, wrong discriminants and invalid radii", () => {
  const code = example("Type guard для неизвестных данных", "circle-guard");
  assert.equal(
    run(
      code,
      "JSON.stringify([null, [], {}, {radius: 1}, {kind:'square',radius:1}, {kind:'circle',radius:'1'}, {kind:'circle',radius:-1}, {kind:'circle',radius:Infinity}, {kind:'circle',radius:NaN}, {kind:'circle',radius:0}, {kind:'circle',radius:2,extra:true}].map(isCircle))",
    ),
    "[false,false,false,false,false,false,false,false,false,true,true]",
  );
  typecheck(
    code +
      `
function read(value: unknown) {
  if (isCircle(value)) { const radius: number = value.radius; return radius; }
  // @ts-expect-error unknown is not narrowed outside the successful guard
  return value.radius;
}
`,
  );
});

test("memoization caches undefined, distinguishes primitive keys and clears results", () => {
  const code = example("Мемоизация функции с очисткой кэша", "memoize");
  assert.equal(
    run(
      code,
      `(() => {
    let calls = 0; const memo = memoize(() => { calls++; return undefined; });
    memo(0); memo(0); memo('0'); memo(NaN); memo(NaN);
    const before = calls; memo.clearCache(); memo(0);
    let failures = 0; const failing = memoize(() => { failures++; throw Error('x'); });
    for (let i = 0; i < 2; i++) { try { failing(1); } catch {} }
    return JSON.stringify([before, calls, failures]);
  })()`,
    ),
    "[3,4,2]",
  );
});

test("pipe preserves empty input and ordering, and stops after a thrown error", () => {
  const code = example(
    "Pipe: результат одной функции передать следующей",
    "pipe",
  );
  assert.equal(
    run(code, "JSON.stringify([pipe()(0),pipe(x => x + 1,x => x * 2)(3)])"),
    "[0,8]",
  );
  assert.equal(
    run(
      code,
      `(() => { let later = false; try { pipe(() => { throw Error('stop'); }, () => { later = true; })(0); } catch (error) { return error.message + ':' + later; } })()`,
    ),
    "stop:false",
  );
});

test("promisify forwards receiver and arguments, propagates callback failure and synchronous throws", async () => {
  const code = example("promisify: ошибка в первом аргументе", "promisify");
  assert.equal(
    await run(
      code,
      "promisify(function(a,b,done) { done(null,this.base+a+b); }).call({base:10},2,3)",
    ),
    15,
  );
  await assert.rejects(
    run(code, "promisify(done => done(Error('callback')))()"),
    /callback/,
  );
  await assert.rejects(
    run(code, "promisify(() => { throw Error('sync'); })()"),
    /sync/,
  );
  assert.equal(
    await run(code, "promisify(done => { done(null,0); done(null,99); })()"),
    0,
  );
});

test("path lookup preserves falsy and undefined values and excludes inherited properties", () => {
  const code = example("Получить значение по пути", "get-path");
  assert.equal(
    run(
      code,
      `(() => {
    const object = { a: { zero: 0, no: false, nil: null, absent: undefined }, items: ['x'] };
    return JSON.stringify([getByPath(object,'a.zero',9),getByPath(object,'a.no',9),getByPath(object,'a.nil',9),getByPath(object,'a.absent',9) === undefined,getByPath(object,'a.missing',9),getByPath(object,'items.0',9),getByPath(object,'',9) === object,getByPath(object,'toString',9),getByPath(object,'a.nil.x',9)]);
  })()`,
    ),
    '[0,false,null,true,9,"x",true,9,9]',
  );
});

test("flatten preserves arrays and empty objects, while grouping handles prototype-like keys without mutation", () => {
  const flatten = example("Объект в плоские ключи с точками", "flatten-object");
  assert.equal(
    run(
      flatten,
      "JSON.stringify(flattenObject({ user: { name: 'A' }, nil: null, items: [1], empty: {}, no: false }))",
    ),
    '{"user.name":"A","nil":null,"items":[1],"empty":{},"no":false}',
  );
  assert.equal(run(flatten, "JSON.stringify(flattenObject({}))"), "{}");
  const group = example("Группировка операций", "group-operations");
  assert.equal(
    run(
      group,
      `JSON.stringify(groupOperations(Object.freeze([
    Object.freeze({category:'__proto__',amount:5,valid:true}),
    Object.freeze({category:'__proto__',amount:-2,valid:true}),
    Object.freeze({category:'skip',amount:99,valid:false})
  ])))`,
    ),
    '{"__proto__":{"count":2,"amount":3}}',
  );
  assert.equal(run(group, "JSON.stringify(groupOperations([]))"), "{}");
});

test("API normalization preserves order, nullable users and latest user data without mutating inputs", () => {
  const code = example("Нормализация API-ответа", "normalize-orders");
  assert.equal(
    run(
      code,
      `(() => {
    const orders = Object.freeze([
      Object.freeze({id:'b',total:10,user:Object.freeze({id:'u',name:'Old'})}),
      Object.freeze({id:'a',total:0,user:null}),
      Object.freeze({id:'c',total:20,user:Object.freeze({id:'u',name:'New'})}),
      Object.freeze({id:'__proto__',total:1,user:Object.freeze({id:'__proto__',name:'Safe'})})
    ]);
    const result = normalizeOrders(orders);
    result.usersById.u.name = 'Edited';
    return JSON.stringify([result.orderIds,result.ordersById.b,result.ordersById.a,
      result.ordersById.c.userId,result.usersById['__proto__'],result.ordersById['__proto__'].id,
      orders[2].user.name]);
  })()`,
    ),
    '[["b","a","c","__proto__"],{"id":"b","total":10,"userId":"u"},{"id":"a","total":0,"userId":null},"u",{"id":"__proto__","name":"Safe"},"__proto__","New"]',
  );
  assert.equal(
    run(code, "JSON.stringify(normalizeOrders([]))"),
    '{"ordersById":{},"usersById":{},"orderIds":[]}',
  );
});

test("Promise.all example preserves input order and rejects before a pending sibling", async () => {
  const code = example("Реализовать Promise.all", "promise-all");
  const job = run(
    code,
    `(() => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    return { finish, result: promiseAll([pending, Promise.resolve(2), 3]).then(JSON.stringify) };
  })()`,
  );
  job.finish(1);
  assert.equal(await job.result, "[1,2,3]");
  assert.equal(await run(code, "promiseAll([]).then(JSON.stringify)"), "[]");
  await assert.rejects(
    run(
      code,
      "promiseAll([new Promise(() => {}),Promise.reject(Error('failed'))])",
    ),
    /failed/,
  );
});

test("retry returns successful JSON and does not repeat permanent HTTP or JSON errors", async () => {
  const code = example("fetchRetry с задержкой", "fetch-retry");
  let calls = 0;
  const fetch = async () => {
    calls++;
    if (calls === 1) throw Error("offline");
    if (calls === 2) return { ok: false, status: 503 };
    return { ok: true, status: 200, json: async () => "ready" };
  };
  assert.equal(
    await run(code, "fetchRetry('/test',3,0)", { fetch, setTimeout }),
    "ready",
  );
  assert.equal(calls, 3);
  for (const response of [
    { ok: false, status: 404 },
    {
      ok: true,
      status: 200,
      json: async () => {
        throw Error("invalid JSON");
      },
    },
  ]) {
    let requests = 0;
    await assert.rejects(
      run(code, "fetchRetry('/test',3,0)", {
        fetch: async () => {
          requests++;
          return response;
        },
        setTimeout,
      }),
      /404|invalid JSON/,
    );
    assert.equal(requests, 1);
  }
  let failures = 0;
  await assert.rejects(
    run(code, "fetchRetry('/test',2,0)", {
      fetch: async () => {
        throw Error(`network-${++failures}`);
      },
      setTimeout,
    }),
    /network-2/,
  );
  assert.equal(failures, 2);
});
