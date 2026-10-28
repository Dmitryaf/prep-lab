// Readiness check for the reviewed curriculum, using the real knowledge API and UI.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from './serve.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const destination=q=>base+'/#'+new URLSearchParams({view:'practice',question:q.id});
const state=()=>page.evaluate(()=>localStorage.getItem('project-map-platform-v3'));
await mkdir('artifacts/core-review-20261028',{recursive:true});
try{
  const bank=await (await fetch(base+'/api/knowledge')).json();assert.deepEqual(bank.warnings,[]);assert.equal(bank.route.length,66);
  const questions=bank.route.map(id=>bank.questions.find(q=>q.id===id));
  await page.goto(base);await page.locator('[data-action=daily]:enabled').waitFor();const before=await state();
  let links=0;const checked=[];
  for(let i=0;i<questions.length;i++){
    const q=questions[i];assert(q.answer&&q.criteria&&q.learningLinks?.some(l=>l.kind==='theory'),q.title);
    await page.goto(destination(q));await page.getByRole('heading',{name:q.title,exact:true}).waitFor();
    assert.equal(await page.locator('.platform-answer').count(),0,q.title);
    await page.locator('[data-action=reveal]').click();
    const answer=await page.locator('.platform-answer').innerText();assert(answer.includes('Проверьте себя'),q.title);
    assert(answer.includes(q.criteria.replace(/`/g,'')),q.title);
    for(const link of q.learningLinks){
      const expected=bank.notes.find(n=>n.id===link.noteId);assert(expected,q.title);
      const prefix=link.kind==='theory'?'Изучить тему':'Решить задачу';
      await page.getByRole('link',{name:`${prefix}: ${expected.title}`,exact:true}).click();
      await page.locator('.platform-note').waitFor();
      const r=new URLSearchParams(new URL(page.url()).hash.slice(1));assert.equal(r.get('note'),link.noteId);assert.equal(r.get('heading')||'',link.heading||'');
      assert((await page.locator('.platform-note').innerText()).length>100);
      links++;
      await page.goto(destination(q));await page.locator('[data-action=reveal]').click();
    }
    if([0,15,49,54,65].includes(i)){
      await page.setViewportSize({width:390,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`mobile overflow: ${q.title}`);
      await page.screenshot({path:`artifacts/core-review-20261028/card-${i+1}-mobile.png`,fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
    }
    checked.push({id:q.id,title:q.title,hiddenBeforeReveal:true,criteria:true,links:q.learningLinks.length});
    if((i+1)%22===0)console.log(`Checked ${i+1}/66 cards and ${links} learning links`);
  }
  assert.equal(await state(),before,'reading should not change progress');
  // Study → mark a gap → repeat → independent retry can be marked confident.
  const q=questions[15];await page.goto(destination(q));await page.locator('[data-action=reveal]').click();
  assert((await page.locator('.platform-answer').innerText()).includes('[2, 1, 3]'));
  await page.locator('[data-rating=partial]').click();await page.locator('#platformNav a[href="#view=repeat"]').click();
  await page.getByRole('link').filter({hasText:q.title}).click();await page.locator('[data-action=reveal]').click();await page.locator('[data-rating=done]').click();
  await page.locator('#platformNav a[href="#view=repeat"]').click();assert.equal(await page.locator('.platform-list-row').count(),0);
  const saved=JSON.parse(await state());assert.equal(saved.questionProgress[q.id].status,'done');
  await page.reload();assert.deepEqual(JSON.parse(await state()),saved);
  assert.deepEqual(errors,[]);
  await writeFile('artifacts/core-review-20261028/browser-evidence.json',JSON.stringify({cards:checked,links,errors,repeatAndReload:true},null,2));
  console.log(`PASS core curriculum: 66 hidden/revealed answers, criteria, ${links} live study links, 5 narrow layouts, repeat/reload, no reading-side progress changes`);
}catch(error){await page.screenshot({path:'artifacts/core-review-20261028/failure.png',fullPage:true});throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));}
