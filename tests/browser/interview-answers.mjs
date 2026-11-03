import {startBrowserScenario} from '../helpers/browser.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadKnowledge} from '../../server/knowledge.mjs';
import {loadState, createSession, storageKey} from '../../src/progress/engine.js';

const bank = loadKnowledge(process.env.CAREER_KNOWLEDGE_ROOT || '../career-knowledge');
const id = 'ck:Собеседования/Темы/JavaScript#Как работает цикл событий в браузере?';
const current = bank.questions.find(q => q.id === id);
assert(current);
// A legacy snapshot keeps the historical format; it must not be replaced from the live bank.
const legacy = {...current, shortAnswer:'Синхронный код выполняется до конца.',
  answer:'Синхронный код выполняется до конца.\n\n**Уточнения**\n\n- Почему таймер ждёт?\n\nПример: таймер выполняется после синхронного кода.',
  followups:['Почему таймер ждёт?'], followupAnswers:[]};
const daily = {...createSession([legacy], 'daily'), id:'daily:2026-11-03',
  date:'2026-11-03', reviewed:[id], ratings:{[id]:'partial'}};
const initial = {...loadState({getItem:()=>null}), daily:{[daily.date]:daily}, activeSession:daily.id};
const {server,base,browser,context,page,errors,close}=await startBrowserScenario({contextOptions:{viewport:{width:1440,height:1100},timezoneId:'Asia/Yekaterinburg'}});
await context.addInitScript(({key, value}) => {
  if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
}, {key:storageKey, value:initial});

const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
const visit = async (view, args) => { await page.goto(base + '/#/' + view + '?' + new URLSearchParams(args)); };
await mkdir('artifacts/interview-answers', {recursive:true});
try {
  await visit('interview', {session:daily.id});
  await page.locator('.platform-answer').waitFor();
  let text = await page.locator('.question-card').textContent();
  assert.equal(text.split(legacy.shortAnswer).length - 1, 1, 'legacy short answer appears only once');
  assert.equal(text.split('Почему таймер ждёт?').length - 1, 1, 'followups appear only once');
  const supplement = page.locator('.platform-answer details').filter({has:page.locator('summary', {hasText:'Дополнительно'})});
  await supplement.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await supplement.getAttribute('open'), '');
  assert((await supplement.innerText()).includes('Пример: таймер'));
  const beforeReload = await state();
  assert.deepEqual(beforeReload.daily[daily.date], daily);
  await page.reload(); await page.locator('.platform-answer').waitFor();
  assert.deepEqual(await state(), beforeReload);
  await page.screenshot({path:'artifacts/interview-answers/legacy-desktop.png', fullPage:true});

  await visit('practice', {question:id});
  await page.locator('[data-action=reveal]').click();
  const panel = page.locator('.platform-answer');
  text = await panel.innerText();
  assert(text.includes('Browser APIs') && text.includes('Call Stack') && text.includes('макрозадач'));
  assert.equal(await panel.locator('pre').count(), 1, 'example visible in main answer');
  assert.equal(await panel.locator('details').count(), 0, 'no empty or repeated supplement');
  assert((await panel.innerText()).includes('Начало → Конец → Promise → Таймер'));
  await page.screenshot({path:'artifacts/interview-answers/event-loop-desktop.png', fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({path:'artifacts/interview-answers/event-loop-mobile.png', fullPage:true});
  await page.getByRole('link', {name:/^Изучить тему:/}).first().click();
  await page.locator('.platform-note').waitFor();
  await page.goBack(); await page.locator('[data-action=reveal]').click();
  await page.getByRole('link', {name:/^Решить задачу:/}).first().click();
  await page.locator('.platform-note').waitFor();

  // Current content reaches new daily/full snapshots, with the existing reveal rules.
  for (const kind of ['daily','full']) {
    const session = createSession([current], kind);
    if (kind === 'daily') session.id = `daily:${session.date}`;
    const value = {...loadState({getItem:()=>null}), activeSession:session.id};
    if (kind === 'daily') value.daily[session.date] = session;
    else value.sessions[session.id] = session;
    await page.evaluate(({key,value}) => localStorage.setItem(key, JSON.stringify(value)), {key:storageKey,value});
    // A changed document query starts the app directly on the restored interview,
    // without racing the previous note's asynchronous anchor navigation.
    await page.goto(base + '/?answer-check=' + kind + '#/interview?' + new URLSearchParams({session:session.id}));
    await page.locator('[data-action=session-next]').waitFor();
    assert.equal(await page.locator('.platform-answer').count(), 0);
    if (kind === 'daily') {
      await page.locator('[data-action=session-review]').click();
      await page.locator('.platform-answer').waitFor();
      assert((await page.locator('.platform-answer').innerText()).includes('Browser APIs'));
      assert.deepEqual((await state()).daily[session.date].snapshots[id], current);
    } else assert.equal(await page.locator('[data-action=session-review]').count(), 0);
    await page.locator('[data-action=session-next]').click();
    await page.getByRole('heading', {name:'Разбор интервью',exact:true}).waitFor();
    assert((await page.locator('.platform-answer').innerText()).includes('Browser APIs'));
    assert.equal(await page.locator('.platform-answer pre').count(), 1);
  }
  assert.deepEqual(errors, []);
  console.log('PASS answers: legacy snapshot unchanged, unique continuation, followups once, keyboard, Event Loop main example, desktop/mobile, study links, new daily/full reveal rules');
} finally {
  await close();
}
