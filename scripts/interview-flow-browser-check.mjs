import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from './serve.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('project-map-platform-v3')));
const current=s=>s.daily[Object.keys(s.daily).at(-1)];
await mkdir('artifacts/interview-fixes',{recursive:true});
try{
  await page.goto(base);await page.locator('[data-action=daily]:enabled').click();
  await page.locator('[data-action=session-review]').waitFor();
  const first=current(await state()),id=first.questionIds[0],url=page.url();
  assert.equal(first.questionIds.length,11);
  assert.equal(await page.locator('.platform-answer').count(),0);
  // A: answer -> review -> rate -> study -> back -> reload, same question and selection.
  await page.locator('[data-action=session-review]').click();
  await page.locator('[data-rating=partial]').click();
  await page.getByRole('link',{name:/^Изучить тему:/}).first().click();
  await page.locator('.platform-note').waitFor();
  await page.locator('[data-action=back]').click();await page.waitForURL(url);
  await page.locator('.platform-answer').waitFor();await page.reload();await page.locator('.platform-answer').waitFor();
  assert.deepEqual(current(await state()).questionIds,first.questionIds);assert.equal(current(await state()).index,0);
  assert.equal((await state()).questionProgress[id].status,'partial');
  // Reach a project, open its source map and inspect actual code references in the iframe.
  const projectIndex=first.questionIds.findIndex(id=>first.snapshots[id].kind==='project');
  for(let i=0;i<projectIndex;i++)await page.locator('[data-action=session-skip]').click();
  await page.locator('[data-action=session-review]').click();await page.locator('[data-rating=again]').click();
  const projectId=first.questionIds[projectIndex];
  await page.getByRole('link',{name:'Проект и реализация в коде',exact:true}).click();
  const frame=page.frameLocator('.platform-project-frame');
  await frame.getByRole('button',{name:'Закрыть разбор'}).waitFor();
  assert((await frame.locator('body').innerText()).includes('Реализация'));
  const code=frame.locator('.code-step a').first();
  await code.scrollIntoViewIfNeeded();assert(await code.isVisible());
  assert.match(await code.getAttribute('href'),/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/blob\/[a-f0-9]+\/.+#L\d+/);
  await page.screenshot({path:'artifacts/interview-fixes/project-code.png',fullPage:true});
  // B: project gap opens the same answer, theory and code; marks persist.
  await page.locator('#platformNav a[href="#view=repeat"]').click();
  await page.locator(`.platform-list-row[href*="${encodeURIComponent(projectId)}"]`).click();
  await page.locator('[data-action=reveal]').click();
  assert(await page.getByRole('link',{name:'Проект и реализация в коде',exact:true}).count());
  await page.locator('[data-rating=done]').click();await page.reload();await page.locator('[data-action=reveal]').waitFor();
  assert.equal((await state()).questionProgress[projectId].status,'done');
  // Historical Javascript/Typescript routes resolve, including old exported snapshot links.
  const bank=await (await fetch(base+'/api/knowledge')).json();
  for(const section of ['JavaScript','TypeScript']){
    const note=bank.notes.find(n=>n.id.startsWith(`Фронтенд/${section}/`));
    const legacy=note.id.replace(section,section==='JavaScript'?'Javascript':'Typescript');
    await page.goto(base+'/#'+new URLSearchParams({view:'themes',note:legacy}));
    await page.locator('.platform-note').waitFor();assert((await page.locator('.platform-note .platform-meta').innerText()).includes(section));
  }
  // C: full interview has all requested groups; answers hidden until it finishes.
  await page.goto(base);await page.locator('[data-action=full]:enabled').click();
  await page.locator('[data-action=session-next]').waitFor();
  const full=Object.values((await state()).sessions).at(-1),qs=Object.values(full.snapshots);
  assert.equal(qs.length,20);for(const p of ['trajectory','inbox','lanit'])assert(qs.some(q=>q.project===p));
  assert(qs.some(q=>q.kind==='behavioral'));assert(qs.some(q=>['ln-org','ln-rules'].includes(q.topicId)));
  assert.equal(await page.locator('[data-action=session-review]').count(),0);
  let steps=0;
  while(await page.locator('[data-action=session-next]').count()){
    assert(++steps<160);assert.equal(await page.locator('.platform-answer').count(),0);
    await page.locator('[data-action=session-next]').click();
    if(steps===5){await page.reload();await page.locator('[data-action=session-next]').waitFor();}
  }
  assert.equal(await page.locator('.platform-answer').count(),20);
  await page.locator('[data-rating=again]').last().click();
  assert(Object.values((await state()).sessions).at(-1).finished);
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'artifacts/interview-fixes/full-review-mobile.png',fullPage:true});
  await page.goto(url);await page.locator('[data-action=session-next]').waitFor();
  assert.equal(current(await state()).index,projectIndex);
  await page.screenshot({path:'artifacts/interview-fixes/daily-review-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS daily review/study/return/reload, project code and repeat, legacy paths, full20 with followups and persisted ratings, mobile');
}finally{await browser.close();await new Promise(r=>server.close(r));}
