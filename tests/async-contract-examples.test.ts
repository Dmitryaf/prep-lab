import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { getEventListeners } from "node:events";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";

const common = loadCommonKnowledge();
const titles = [
  "Запросы через одно соединение: ответы не по порядку",
  "Пакетная загрузка по ID с частичным кэшем",
];
function code(title: string, marker: string) {
  const question = common.questions.find((entry) => entry.title === title);
  assert(question?.availableAnswer, `Missing worked solution: ${title}`);
  assert(question.criteria && question.learningLinks.length);
  if (title === titles[0]) assert.equal(question.followups.length, 2);
  else {
    const stage = question.followupAnswers?.find((entry) =>
      entry.answer.includes(`// checked-example: ${marker}`),
    );
    assert(
      stage,
      "The full cache solution must remain available as an optional stage",
    );
    const child = common.questions.find(
      (entry) => entry.parentId === question.id && entry.title === stage.title,
    );
    assert(child?.criteria && child.learningLinks.length);
    assert.equal(child.followups.length, 2);
  }
  assert.equal(question.roundFormat, "coding");
  const answers = [
    question.answer,
    ...(question.followupAnswers ?? []).map((entry) => entry.answer),
  ].join("\n");
  const block = [...answers.matchAll(/```js\n([\s\S]*?)```/g)].find((match) =>
    match[1].includes(`// checked-example: ${marker}`),
  );
  assert(block, `Missing executable example: ${marker}`);
  return block[1];
}
const transportFixture = `
const timers = new Map(); let nextTimer = 0;
const setTimeout = (fn) => { timers.set(++nextTimer, fn); return nextTimer; };
const clearTimeout = id => timers.delete(id);
let receive, remoteClose, detached = 0;
const sent = [];
const transport = {
  subscribe(message, close) { receive = message; remoteClose = close; return () => detached++; },
  send(message) { sent.push(message); }
};
`;
function run(source: string, scenario: string, fixture = "") {
  return vm.runInNewContext(
    `${fixture}\n${source}\n(async () => { ${scenario} })()`,
    { AbortController, getEventListeners },
    { timeout: 3000 },
  );
}

test("multiplexer correlates out-of-order answers, ignores duplicates and clears timers", async () => {
  assert.equal(
    await run(
      code(titles[0], "request-multiplexer"),
      `
    const client = createRequestClient(transport, 100);
    const controller = new AbortController();
    const a = client.request('A', {signal: controller.signal}), b = client.request('B', {signal: controller.signal});
    if (sent[0].id === sent[1].id) throw Error('Repeated id');
    receive({id: 'unknown', ok: true, value: 'wrong'});
    receive({id: sent[1].id, ok: true, value: 'second'});
    receive({id: sent[1].id, ok: true, value: 'duplicate'});
    receive({id: sent[0].id, ok: true, value: 'first'});
    const result = await Promise.all([a, b]);
    client.close();
    return JSON.stringify([result, timers.size, detached, getEventListeners(controller.signal, 'abort').length]);
  `,
      transportFixture,
    ),
    '[["first","second"],0,1,0]',
  );
});

test("multiplexer handles abort, timeout, transport close and rejects future work", async () => {
  assert.equal(
    await run(
      code(titles[0], "request-multiplexer"),
      `
    const client = createRequestClient(transport, 100);
    const aborted = new AbortController(); aborted.abort();
    const pre = await client.request('never', {signal: aborted.signal}).catch(e => e.message);
    const controller = new AbortController();
    const a = client.request('A', {signal: controller.signal}).catch(e => e.message);
    controller.abort();
    const b = client.request('B').catch(e => e.message);
    [...timers.values()][0]();
    const closingController = new AbortController();
    const c = client.request('C', {signal: closingController.signal}).catch(e => e.message);
    remoteClose(); client.close();
    receive({id: sent[0].id, ok: true, value: 'late'});
    const d = await client.request('D').catch(e => e.message);
    return JSON.stringify([pre, await a, await b, await c, d, sent.length, timers.size, detached, getEventListeners(closingController.signal, 'abort').length]);
  `,
      transportFixture,
    ),
    '["Aborted","Aborted","Timeout","Closed","Closed",3,0,1,0]',
  );
});

test("multiplexer registers before send and cleans server/send failures", async () => {
  assert.equal(
    await run(
      code(titles[0], "request-multiplexer"),
      `
    const client = createRequestClient(transport, 100);
    transport.send = ({id}) => receive({id, ok: false, error: 'Denied'});
    const failed = await client.request('A').catch(e => e.message);
    transport.send = () => { throw Error('Send failed'); };
    const broken = await client.request('B').catch(e => e.message);
    client.close();
    return JSON.stringify([failed, broken, timers.size]);
  `,
      transportFixture,
    ),
    '["Denied","Send failed",0]',
  );
});

test("batch loader keeps duplicate order and requests only uncached IDs", async () => {
  assert.equal(
    await run(
      code(titles[1], "partial-cache"),
      `
    const calls = [];
    const cache = new Map([['a', 0]]);
    const getByIds = createCachedLoader(async ids => {
      calls.push(ids); return new Map(ids.map(id => [id, id.toUpperCase()]));
    }, cache);
    const first = await getByIds(['b', 'a', 'b', 'c']);
    const second = await getByIds(['c', 'b']);
    const empty = await getByIds([]);
    return JSON.stringify([first, second, empty, calls]);
  `,
    ),
    '[["B",0,"B","C"],["C","B"],[],[["b","c"]]]',
  );
});

test("batch loader shares pending IDs and retries after rejection without poisoning cache", async () => {
  assert.equal(
    await run(
      code(titles[1], "partial-cache"),
      `
    const batches = [], cache = new Map();
    const get = createCachedLoader(ids => new Promise((resolve, reject) => batches.push({ids, resolve, reject})), cache);
    const first = get(['a', 'b']).catch(e => e.message);
    const second = get(['b', 'c']);
    await Promise.resolve();
    batches[0].resolve(new Map([['a', 'A'], ['b', 'B']]));
    batches[1].resolve(new Map([['c', 'C']]));
    const values = [await first, await second];
    const failed = get(['d', 'e']).catch(e => e.message);
    await Promise.resolve(); batches[2].reject(Error('Offline'));
    values.push(await failed);
    const retry = get(['e', 'd']);
    await Promise.resolve(); batches[3].resolve(new Map([['d', 'D'], ['e', 'E']]));
    values.push(await retry);
    return JSON.stringify([values, batches.map(batch => batch.ids), cache.size]);
  `,
    ),
    '[[["A","B"],["B","C"],"Offline",["E","D"]],[["a","b"],["c"],["d","e"],["e","d"]],5]',
  );
});

test("incomplete batch does not cache a partial success and can be retried", async () => {
  assert.equal(
    await run(
      code(titles[1], "partial-cache"),
      `
    const cache = new Map(); let calls = 0;
    const get = createCachedLoader(async () => ++calls === 1
      ? new Map([['a', 1]]) : new Map([['a', 1], ['b', undefined]]), cache);
    const error = await get(['a', 'b']).catch(e => e.message);
    const sizeAfterFailure = cache.size;
    const values = await get(['b', 'a']);
    await get(['b']);
    return JSON.stringify([error, sizeAfterFailure, values, calls, cache.has('b')]);
  `,
    ),
    '["Missing result: b",0,[null,1],2,true]',
  );
});
