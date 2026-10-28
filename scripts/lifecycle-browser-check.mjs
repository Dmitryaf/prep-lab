import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function worker(env={}){
 const process=fork(new URL('./fixtures/lifecycle-server.mjs',import.meta.url),[],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...globalThis.process.env,...env}});
 const exit=once(process,'exit');const [{base}]=await once(process,'message');return {process,exit,base};
}
async function exited(worker){let timeout;try{const [code]=await Promise.race([worker.exit,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Server process did not exit')),10000);})]);assert.equal(code,0);}finally{clearTimeout(timeout);}}
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const directory=mkdtempSync(join(tmpdir(),'map-lifecycle-browser-'));
const live=await worker({TEST_CHAT_DIR:directory});
try{
 const context=await browser.newContext();const first=await context.newPage();
 const open=async page=>{const connected=page.waitForResponse(r=>r.url().endsWith('/api/lifecycle'));await page.goto(live.base);assert.equal((await connected).status(),200);};
 await open(first);const second=await context.newPage();await open(second);
 await first.close();await delay(1100);assert.equal(live.process.exitCode,null);assert.equal((await fetch(live.base+'/')).status,200);
 const connection=second.waitForResponse(r=>r.url().endsWith('/api/lifecycle'));await second.reload();await connection;await delay(1100);assert.equal(live.process.exitCode,null);
 if(process.argv.includes('--live')){
  const response=await fetch(live.base+'/api/study-chat?key=lifecycle-smoke',{method:'POST',headers:{Origin:live.base,'Content-Type':'application/json'},body:JSON.stringify({context:'JavaScript Promise',message:'Объясни Promise одним коротким предложением.'}),signal:AbortSignal.timeout(120000)});
  assert.equal(response.status,200);const body=await response.text();assert(body.includes('"done":true'),body);assert(body.includes('"delta":'));
 }
 await second.close();await exited(live);await assert.rejects(()=>fetch(live.base+'/'));
 const neverOpened=await worker({TEST_STARTUP_MS:'200'});try{await exited(neverOpened);}finally{neverOpened.process.kill();}
 console.log('PASS lifecycle: real Vite proxy, two tabs, background tab, reload, last close releases port and exits process, startup timeout'+(process.argv.includes('--live')?', real Codex request and process cleanup':''));
}finally{live.process.kill();await browser.close();rmSync(directory,{recursive:true,force:true});}
