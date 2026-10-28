import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from './serve.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('project-map-platform-v3')));
const daily=s=>s.daily['2026-10-28'];
const restore=async value=>{
  await page.locator('#platformImport').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await page.getByRole('status').filter({hasText:'Прогресс восстановлен'}).waitFor();
};
await mkdir('artifacts/optional-followups',{recursive:true});
try{
  await page.clock.install({time:new Date('2026-10-28T12:00:00+05:00')});
  await page.goto(base);await page.locator('[data-action=daily]:enabled').click();
  await page.locator('[data-action=session-next]').waitFor();const original=await state(),url=page.url();
  assert.equal(daily(original).questionIds.length,11);
  // Eleven main answers complete the daily interview without a single followup or skip.
  for(let i=0;i<11;i++){
    assert.equal(daily(await state()).index,i);
    assert.equal(await page.locator('[data-action=session-next]').innerText(),i===10?'Завершить интервью':'Следующий вопрос');
    await page.locator('[data-action=session-next]').click();
  }
  assert(daily(await state()).finished);assert.deepEqual(daily(await state()).skipped,[]);
  assert.deepEqual(daily(await state()).ratings,{});assert.equal(await page.locator('.platform-answer').count(),11);
  assert(await page.getByText('Уточнения и разбор',{exact:true}).count()>0);
  // One optional followup: review, rate, study and back all preserve this exact prompt.
  await restore(original);await page.goto(url);
  await page.locator('[data-action=session-followup]').focus();await page.keyboard.press('Enter');
  const prompt=await page.locator('.question-card h2').innerText();
  assert.equal(await page.locator('[data-action=session-followup]').count(),0);
  await page.locator('[data-action=session-review]').click();await page.locator('[data-rating=partial]').click();
  assert.equal(await page.locator('.platform-answer h3').innerText(),'Разбор основной темы');
  await page.getByRole('link',{name:/^Изучить тему:/}).first().click();await page.locator('.platform-note').waitFor();
  await page.locator('[data-action=back]').click();await page.waitForURL(url);await page.reload();
  await page.locator('.platform-answer').waitFor();assert.equal(await page.locator('.question-card h2').innerText(),prompt);
  const saved=await state();const downloadEvent=page.waitForEvent('download');await page.locator('[data-action=export]').click();
  const download=await downloadEvent,exported=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.deepEqual(exported,saved);await restore(exported);assert.deepEqual(await state(),saved);
  const malformed=structuredClone(saved);daily(malformed).followupChoices={missing:[0]};
  await page.locator('#platformImport').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))});
  await page.getByRole('status').filter({hasText:'Импорт отклонён'}).waitFor();assert.deepEqual(await state(),saved);
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'artifacts/optional-followups/daily-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Следующий вопрос',exact:true}).click();
  assert.equal(daily(await state()).index,1);assert.deepEqual(daily(await state()).skipped,[]);
  await page.setViewportSize({width:1440,height:1000});
  // Full interview: two optional prompts only, no answers before completion.
  await page.goto(base);await page.locator('[data-action=full]:enabled').click();await page.locator('[data-action=session-next]').waitFor();
  const fullState=await state(),full=Object.values(fullState.sessions).at(-1),fullURL=page.url();
  await page.locator('[data-action=session-followup]').click();const one=await page.locator('.question-card h2').innerText();
  await page.locator('[data-action=session-followup]').click();const two=await page.locator('.question-card h2').innerText();assert.notEqual(one,two);
  assert.equal(await page.locator('[data-action=session-followup]').count(),0);
  await page.reload();await page.locator('[data-action=session-next]').waitFor();assert.equal(await page.locator('.question-card h2').innerText(),two);
  assert.equal(await page.locator('[data-action=session-review]').count(),0);assert.equal(await page.locator('.platform-answer').count(),0);
  await page.screenshot({path:'artifacts/optional-followups/full-desktop.png',fullPage:true});
  for(let i=0;i<20;i++){assert.equal(await page.locator('.platform-answer').count(),0);await page.locator('[data-action=session-next]').click();}
  assert.equal(await page.locator('.platform-answer').count(),20);assert.deepEqual((await state()).sessions[full.id].skipped,[]);
  // Legacy payloads retain an already-open third followup, even beyond the new cap.
  for(const kind of ['daily','full']){
    const old=structuredClone(kind==='daily'?original:fullState),s=kind==='daily'?daily(old):old.sessions[full.id];
    const index=kind==='full'?s.questionIds.findIndex(id=>s.snapshots[id].project==='lanit'):0;
    s.index=index;const id=s.questionIds[index],q=s.snapshots[id];assert(q.followups.length>=3);
    s.followupIndex=3;s.ratings[id]='partial';delete s.followupChoices;
    if(kind==='full'){delete q.project;q.category='Собственные проекты';}
    await restore(old);await page.goto(kind==='daily'?url:fullURL);await page.locator('[data-action=session-next]').waitFor();
    assert.equal(await page.locator('.question-card h2').innerText(),q.followups[2]);
    assert.equal(await page.locator('[data-action=session-followup]').count(),0);
    if(kind==='full')assert((await page.locator('.platform-session-bar').innerText()).startsWith('Коммерческий опыт'));
    await page.locator('[data-action=session-next]').click();
    const after=kind==='daily'?daily(await state()):(await state()).sessions[full.id];
    assert.equal(after.index,index+1);assert.equal(after.ratings[id],'partial');assert.deepEqual(after.skipped,[]);
  }
  // Presentation changes apply in ordinary practice without changing question IDs.
  for(const project of ['lanit','trajectory','inbox']){
    const q=Object.values(full.snapshots).find(q=>q.project===project);
    await page.goto(base+'/#'+new URLSearchParams({view:'practice',question:q.id}));await page.locator('.question-card').waitFor();
    const meta=await page.locator('.question-card .platform-meta').innerText();
    assert(meta.startsWith(project==='lanit'?'Коммерческий опыт':'Личный проект'));
    assert((await page.locator('#practiceCategory option:checked').innerText()).trim().startsWith('Проекты и рабочий опыт'));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS daily11, optional daily1/full2, review/rating/study return, reload/export/import, legacy third followups, project labels and mobile');
}finally{await browser.close();await new Promise(r=>server.close(r));}
