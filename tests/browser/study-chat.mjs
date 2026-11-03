import {launchBrowser} from '../helpers/browser.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createServer} from '../../scripts/serve.mjs';
const live=process.argv.includes('--live'),directory=mkdtempSync(join(tmpdir(),'study-ui-'));
const server=createServer({studyChatOptions:{directory,...(!live?{answer:async({messages,onDelta,signal})=>{
  if(messages.at(-1).text==='Ошибка')throw Error('Проверочная ошибка Codex');
  if(messages.at(-1).text==='Останови'){onDelta('Частичный ответ');await new Promise(r=>signal.addEventListener('abort',r,{once:true}));throw Error('Остановлен');}
  const text=messages.length>1?'Продолжение обсуждения: предыдущий ответ сохранён.':'Promise представляет результат асинхронной операции. '.repeat(30);onDelta(text);return text;
}}:{})}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await launchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
mkdirSync('artifacts/study-chat',{recursive:true});
try{
  const knowledge=await(await fetch(base+'/api/knowledge')).json();const question=knowledge.questions.find(q=>/Promise/.test(q.title)&&q.kind==='theory');assert(question);
  await page.goto(base+'/#/practice?question='+encodeURIComponent(question.id));
  assert.equal(await page.getByRole('button',{name:'Разобраться с Codex',exact:true}).count(),0);
  await page.getByRole('button',{name:'Показать ответ',exact:true}).click();
  const launch=page.getByRole('button',{name:'Разобраться с Codex',exact:true});await launch.focus();await page.keyboard.press('Enter');
  const input=page.getByRole('textbox',{name:'Ваш вопрос или ответ'});await input.waitFor();await input.fill('Объясни Promise одним предложением. Запомни учебное слово «маяк».');
  await page.getByRole('button',{name:'Отправить',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.study-message.assistant pre')?.textContent?.includes('Готовит ответ')===false,{},{timeout:120000});
  await page.getByRole('button',{name:'Отправить',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.study-chat button')).some(b=>b.textContent==='Остановить'),{},{timeout:120000});
  const first=await page.locator('.study-message.assistant pre').innerText();assert(first.length>10);
  await page.reload();await page.getByRole('button',{name:'Показать ответ',exact:true}).click();await page.getByRole('button',{name:'Разобраться с Codex',exact:true}).click();await input.waitFor();assert.equal(await page.locator('.study-message.assistant pre').first().innerText(),first);
  await input.fill('Какое учебное слово я попросил запомнить? Ответь одним словом.');await page.getByRole('button',{name:'Отправить',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.study-message.assistant').length===2&&!Array.from(document.querySelectorAll('.study-chat button')).some(b=>b.textContent==='Остановить'),{},{timeout:120000});
  if(live)assert.match(await page.locator('.study-message.assistant pre').last().innerText(),/маяк/i);
  else{
    await input.fill('Ошибка');await page.getByRole('button',{name:'Отправить',exact:true}).click();await page.getByRole('alert').filter({hasText:'Проверочная ошибка'}).waitFor();
    await input.fill('Останови');await page.getByRole('button',{name:'Отправить',exact:true}).click();await page.getByRole('button',{name:'Остановить',exact:true}).click();await page.getByRole('alert').filter({hasText:'Запрос остановлен'}).waitFor();
  }
  await page.screenshot({path:'artifacts/study-chat/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'artifacts/study-chat/mobile.png',fullPage:true});
  await page.goto(base+'/#/interview');await page.locator('[data-action=full]').click();await page.locator('.question-card').waitFor();assert.equal(await page.getByRole('button',{name:'Разобраться с Codex',exact:true}).count(),0);
  await page.goto(base+'/#/projects?projectTopic=tr-local');await page.getByRole('button',{name:'Разобраться с Codex',exact:true}).click();await input.waitFor();assert.equal(await page.locator('.study-message').count(),0);
  assert.deepEqual(errors,[]);console.log(`PASS ${live?'LIVE Codex':'controlled Codex'}: keyboard, stream, reload, follow-up context, separate topics, mobile layout, full interview gating${live?'':', failure and cancel'}`);
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(directory,{recursive:true,force:true});}
