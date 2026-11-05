import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadCommonKnowledge } from "../server/infrastructure/knowledge/common.ts";

const common = loadCommonKnowledge();
const titles = [
  "Ревью клиента флагов: остановка и поздний ответ",
  "Ревью клиента аналитики: очередь во время отправки",
];
function example(index: number, marker: string) {
  const question = common.questions.find((q) => q.title === titles[index]);
  assert(
    question?.availableAnswer,
    `Missing worked solution: ${titles[index]}`,
  );
  assert.equal(question.roundFormat, "review");
  assert(question.criteria && question.learningLinks.length);
  assert.equal(question.followups.length, 2);
  const block = [...question.answer.matchAll(/```js\n([\s\S]*?)```/g)].find(
    (match) => match[1].includes(`// checked-example: ${marker}`),
  );
  assert(block, `Missing executable example: ${marker}`);
  return block[1];
}
const fixture = `
const timers = new Map(); let nextTimer = 0;
const setTimeout = (fn, delay) => { timers.set(++nextTimer, {fn, delay}); return nextTimer; };
const clearTimeout = id => timers.delete(id);
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const fire = () => { const [id, timer] = [...timers][0]; timers.delete(id); timer.fn(); };
const calls = [];
const fetch = (url, options = {}) => new Promise((resolve, reject) => calls.push({url, options, resolve, reject}));
const response = (data, ok = true) => ({ok, status: ok ? 200 : 503, json: async () => data});
`;
function run(index: number, marker: string, scenario: string) {
  return vm.runInNewContext(
    `${fixture}\n${example(index, marker)}\n(async () => { ${scenario} })()`,
    { AbortController },
    { timeout: 3000 },
  );
}

test("toggle polling starts once and stop rejects a non-cooperative late response", async () => {
  assert.equal(
    await run(
      0,
      "review-toggles",
      `
    const client = new TogglesClient({flag: 'initial'}, {url: '/flags', interval: 100});
    client.start(); client.start();
    const scheduled = timers.size;
    fire(); await tick();
    client.stop(); client.stop();
    calls[0].resolve(response({flag: 'late'})); await tick();
    return JSON.stringify([scheduled, calls.length, client.getToggle('flag'), timers.size, calls[0].options.signal.aborted]);
  `,
    ),
    '[1,1,"initial",0,true]',
  );
});

test("toggle restart keeps old completion from overwriting or rescheduling current work", async () => {
  assert.equal(
    await run(
      0,
      "review-toggles",
      `
    const client = new TogglesClient({flag: 0}, {url: '/flags', interval: 100});
    const old = client.forceUpdate(); await tick();
    client.stop(); client.start();
    const current = client.forceUpdate(); const joined = client.forceUpdate(); await tick();
    calls[1].resolve(response({flag: 2})); await current;
    calls[0].resolve(response({flag: 1})); const oldResult = await old;
    const result = [calls.length, joined === current, client.getToggle('flag'), timers.size, oldResult];
    client.stop(); return JSON.stringify(result);
  `,
    ),
    "[2,true,2,1,false]",
  );
});

test("toggle failures preserve last good data and manual refresh while stopped stays stopped", async () => {
  assert.equal(
    await run(
      0,
      "review-toggles",
      `
    const client = new TogglesClient({flag: false}, {url: '/flags', interval: 100}); client.stop();
    const failed = client.forceUpdate().catch(e => e.message); await tick();
    calls[0].resolve(response({flag: 'bad'}, false));
    const first = await failed;
    const invalid = client.forceUpdate().catch(e => e.message); await tick();
    calls[1].resolve(response([])); const second = await invalid;
    const initial = client.getToggle('flag');
    const good = client.forceUpdate(); await tick(); calls[2].resolve(response({flag: true})); await good;
    return JSON.stringify([first, second, initial, client.getToggle('flag'), timers.size]);
  `,
    ),
    '["HTTP 503","Invalid toggle data",false,true,0]',
  );
});

test("analytics successful batch removes only its snapshot and concurrent sends share work", async () => {
  assert.equal(
    await run(
      1,
      "review-analytics",
      `
    const client = new AnalyticsClient('/metrics', 100);
    const a = {type: 'A', version: 1, args: {value: 1}, timestamp: 1};
    client.queueEvent(a); a.args.value = 99;
    const first = client.sendNow(); const joined = client.sendNow(); await tick();
    client.queueEvent({type: 'B', version: 1, args: {}, timestamp: 2});
    calls[0].resolve(response(null)); await first;
    const second = client.sendNow(); await tick(); calls[1].resolve(response(null)); await second;
    const count = calls.length; await client.sendNow(); client.close();
    return JSON.stringify([first === joined, calls.map(x => JSON.parse(x.options.body)), count, calls.length, timers.size, calls[0].options.headers['Content-Type']]);
  `,
    ),
    '[true,[[{"type":"A","version":1,"args":{"value":1},"timestamp":1}],[{"type":"B","version":1,"args":{},"timestamp":2}]],2,2,0,"application/json"]',
  );
});

test("analytics network and HTTP failures restore batch before later events", async () => {
  assert.equal(
    await run(
      1,
      "review-analytics",
      `
    const client = new AnalyticsClient('/metrics', 100);
    client.queueEvent({type: 'A'});
    const first = client.sendNow().catch(e => e.message); await tick();
    client.queueEvent({type: 'B'}); calls[0].reject(Error('Offline')); const error = await first;
    const retry = client.sendNow().catch(e => e.message); await tick();
    client.queueEvent({type: 'C'}); calls[1].resolve(response(null, false)); const http = await retry;
    const final = client.sendNow(); await tick(); calls[2].resolve(response(null)); await final;
    client.close();
    return JSON.stringify([error, http, calls.map(x => JSON.parse(x.options.body).map(e => e.type)), timers.size]);
  `,
    ),
    '["Offline","HTTP 503",[["A"],["A","B"],["A","B","C"]],0]',
  );
});

test("analytics periodic send waits for completion and close cannot revive its timer", async () => {
  assert.equal(
    await run(
      1,
      "review-analytics",
      `
    const client = new AnalyticsClient('/metrics', 100); client.queueEvent({type: 'A'});
    fire(); await tick(); const during = timers.size;
    calls[0].reject(Error('Offline')); await tick(); const afterFailure = timers.size;
    fire(); await tick(); client.close(); calls[1].resolve(response(null)); await tick();
    return JSON.stringify([during, afterFailure, calls.length, timers.size]);
  `,
    ),
    "[0,1,2,0]",
  );
});
