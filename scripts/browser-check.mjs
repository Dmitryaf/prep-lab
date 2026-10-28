import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {topics,projects} from '../src/projects/catalog/data.js';
import {createServer} from './serve.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('project-map-platform-v3')));
const open=id=>page.goto(base+'/#/projects?projectTopic='+id);
await mkdir('artifacts/vue-migration',{recursive:true});
try{
  await page.goto(base+'/?projects=1');await page.locator('.topic-row').first().waitFor();assert.equal(await page.locator('iframe').count(),0);
  const v1={'tr-purpose':{status:'done',updatedAt:'old'}};
  await page.evaluate(v=>localStorage.setItem('project-map-review-v1',JSON.stringify(v)),v1);await page.reload();
  await page.getByRole('button',{name:/Inbox Point.*тем/}).click();await page.locator('#inlineSearch').fill('React');assert(await page.locator('.topic-row').count()>0);
  await page.locator('.topic-row').first().click();await page.getByRole('button',{name:'✓ Могу объяснить',exact:true}).click();
  assert.deepEqual((await state()).progress['tr-purpose'],v1['tr-purpose']);assert.deepEqual((await state()).questionProgress,{});
  const downloadEvent=page.waitForEvent('download');await page.locator('[data-action=export]').click();const payload=await readFile(await (await downloadEvent).path(),'utf8');
  const before=await state();await page.locator('#platformImport').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":3}')});
  await page.getByRole('status').filter({hasText:'Импорт отклонён'}).waitFor();assert.deepEqual(await state(),before);
  await page.evaluate(()=>localStorage.removeItem('project-map-platform-v3'));await page.reload();
  await page.locator('#platformImport').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:Buffer.from(payload)});
  await page.getByRole('status').filter({hasText:'Прогресс восстановлен'}).waitFor();assert.deepEqual(await state(),before);
  // Every topic renders all four native blocks; answers and full code remain collapsed.
  for(const topic of topics){
    await open(topic.id);await page.locator('#details').waitFor();
    assert.deepEqual(await page.locator('.topic-sections>section>h3').allTextContents(),['Как это работает','Что нужно изучить','Вопросы на собеседовании','Реализация в коде']);
    assert.equal(await page.locator('details.interview-question').count(),topic.pilot.questions.length);
    assert.equal(await page.locator('details.interview-question[open]').count(),0);
    await page.locator('details.interview-question summary').first().click();assert(await page.locator('.interview-answer').first().isVisible());
    const full=page.locator('details.code-full');if(await full.count()){
      assert.equal(await full.getAttribute('open'),null);await full.locator('summary').click();
      assert.equal(await full.locator('.code-step').count(),topic.pilot.code.steps.length);
      for(const [index,step] of topic.pilot.code.steps.entries())if(step.project==='cokr')assert.equal(await full.locator(`[data-index="${index}"]`).count(),1);
    }
  }
  // All 17 routes and all 177 review questions remain reachable in the same app.
  await page.goto(base+'/#/projects');await page.locator('[data-action=mode][data-mode=map]').click();let routes=0;
  for(const p of Object.values(projects)){
    await page.locator(`[data-action=project][data-project=${p.id}]`).click();
    for(const r of p.routes){await page.locator('#projectRoute').selectOption(r.id);assert.equal(await page.locator('.route-topics li').count(),r.nodes.length);routes++;}
  }
  assert.equal(routes,17);
  await page.locator('[data-action=mode][data-mode=review]').click();await page.getByLabel('Охват',{exact:true}).selectOption('both');await page.getByLabel('Набор',{exact:true}).selectOption('all');
  assert((await page.locator('#platformMain').innerText()).includes('1 из 177'));
  const seen=new Set();for(let i=0;i<177;i++){const title=await page.locator('.question-card h2').innerText();seen.add(title);assert.equal(await page.locator('.platform-answer').count(),0);await page.locator('[data-action=reveal]').click();assert(await page.locator('.platform-answer').isVisible());await page.locator('[data-action=next-question]').click();}
  assert(seen.size>140);await page.locator('#reviewMode').selectOption('quick');assert((await page.locator('#platformMain').innerText()).includes('1 из 50'));
  // Copy a corporate source: both clipboard and deliberate denial / fallback.
  await context.grantPermissions(['clipboard-read','clipboard-write']);await open('ln-registration');
  await page.locator('.local-settings summary').click();await page.locator('#sourceRoot').fill('C:\\Work\\cokr');
  await page.locator('[data-action=copy-source]').first().click();assert((await page.evaluate(()=>navigator.clipboard.readText())).startsWith('C:\\Work\\cokr\\src\\'));
  await page.evaluate(()=>{Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw Error('Denied');}});});
  await page.locator('[data-action=copy-source]').first().click();await page.locator('#sourceReference').waitFor();assert((await page.locator('#sourceReference').inputValue()).includes('C:\\Work\\cokr\\src\\'));
  await page.screenshot({path:'artifacts/vue-migration/native-map-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'artifacts/vue-migration/native-map-mobile.png',fullPage:true});
  await page.goto(base+'/#topic=tr-local');await page.locator('#details').waitFor();assert((await page.locator('#details .topic-title').innerText()).includes('IndexedDB'));
  assert.deepEqual(errors,[]);console.log('PASS native Vue map: 50 four-block topics, 177 review questions, quick50, routes17, v1/import/export, clipboard/fallback, old links, desktop/mobile, no iframe');
}finally{await browser.close();await new Promise(r=>server.close(r));}
