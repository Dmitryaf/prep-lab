import {startBrowserScenario} from '../helpers/browser.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {server,base,browser,context,page,errors,close}=await startBrowserScenario({contextOptions:{timezoneId:'Asia/Yekaterinburg'}});

const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('project-map-platform-v3')));
const daily=s=>s.daily['2026-11-03'];
await mkdir('artifacts/interview-navigation',{recursive:true});
try {
  await page.clock.install({time:new Date('2026-11-03T12:00:00+05:00')});
  await page.goto(base);await page.locator('[data-action=daily]:enabled').click();
  await page.locator('[data-action=session-next]').waitFor();
  const previous=page.locator('[data-action=session-previous]');
  assert.equal(await previous.count(),1,'interview has a previous-question action');
  assert(await previous.isDisabled());
  assert.equal(await page.getByRole('button',{name:'Скачать прогресс',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Восстановить',exact:true}).count(),0);
  assert.equal(await page.locator('#platformImport').count(),0);
  assert(!(await page.locator('#platformMain').innerText()).includes('Уточнения необязательны'));
  assert.equal(await page.locator('.platform-footer').count(),0);
  const first=daily(await state()),id=first.questionIds[0],title=first.snapshots[id].title;
  await page.locator('[data-action=session-review]').click();
  await page.locator('[data-rating=partial]').click();
  if (first.snapshots[id].followups?.length) {
    await page.locator('[data-action=session-followup]').click();
    assert.equal((await previous.innerText()).trim(),'К основному вопросу');
    const choices=daily(await state()).followupChoices;
    await previous.focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('.question-card h2').innerText(),title);
    assert.equal(daily(await state()).followupIndex,0);
    assert.deepEqual(daily(await state()).followupChoices,choices);
    assert.equal(await page.locator('[data-action=session-followup]').count(),0);
  }
  await page.locator('[data-action=session-next]').click();
  const secondId=first.questionIds[1];
  await page.locator('[data-action=session-review]').click();await page.locator('[data-rating=again]').click();
  await page.locator('[data-action=session-skip]').click();
  assert.equal(daily(await state()).index,2);
  const before=daily(await state());
  await previous.click();await page.reload();await previous.waitFor();
  assert.equal(daily(await state()).index,1);
  assert.equal(await page.locator('.question-card h2').innerText(),first.snapshots[secondId].title);
  await previous.click();
  assert.equal(await page.locator('.question-card h2').innerText(),title);
  assert.equal(await page.locator('.platform-answer').count(),1);
  assert(await previous.isDisabled());
  await page.locator('[data-action=session-next]').click();
  const after=daily(await state());
  for (const key of ['snapshots','questionIds','ratings','reviewed','skipped','followupChoices']) assert.deepEqual(after[key],before[key],key);
  await page.screenshot({path:'artifacts/interview-navigation/daily-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'artifacts/interview-navigation/daily-mobile.png',fullPage:true});
  await page.goto(base);await page.locator('[data-action=full]:enabled').click();
  await page.locator('[data-action=session-next]').waitFor();
  assert(await previous.isDisabled());
  await page.locator('[data-action=session-next]').click();await previous.click();
  assert.equal(Object.values((await state()).sessions).at(-1).index,0);
  assert.equal(await page.locator('.platform-answer').count(),0);
  if (await page.locator('[data-action=session-followup]').count()) {
    await page.locator('[data-action=session-followup]').click();await previous.click();
    assert.equal(Object.values((await state()).sessions).at(-1).index,0);
    assert.equal(await page.locator('.platform-answer').count(),0);
  }
  await page.reload();await page.locator('[data-action=session-next]').waitFor();
  assert.equal(await page.locator('.platform-answer').count(),0);
  const full=Object.values((await state()).sessions).at(-1);
  for(let i=0;i<full.questionIds.length;i++) await page.locator('[data-action=session-next]').click();
  await page.getByRole('heading',{name:'Разбор интервью',exact:true}).waitFor();
  assert.equal(await page.locator('.platform-answer').count(),full.questionIds.length);
  assert.deepEqual(errors,[]);
  console.log('PASS previous main/followup, first disabled, preserved ratings/review/skips/choices, reload, daily/full reveal rules, clean shell, keyboard and desktop/mobile');
} finally {await close();}
