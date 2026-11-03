import test from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'node:http';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createServer} from '../scripts/serve.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function lease(base){return new Promise((accept,reject)=>{const request=get(base+'/api/lifecycle',res=>{res.once('data',()=>accept({request,res}));});request.on('error',reject);});}

test('leases keep background tabs alive, tolerate reload, then release the last tab',async()=>{
 let stops=0;const server=createServer({lifecycle:{idleMs:120,startupMs:1000,onIdle:()=>{stops++;}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 let first,second,reloaded;
 try{
  assert.equal((await fetch(base+'/api/lifecycle',{headers:{Origin:'https://foreign.invalid'}})).status,403);
  first=await lease(base);second=await lease(base);first.request.destroy();await delay(220);assert.equal(stops,0);
  second.request.destroy();await delay(40);reloaded=await lease(base);await delay(220);assert.equal(stops,0);
  reloaded.request.destroy();await delay(220);assert.equal(stops,1);
 }finally{first?.request.destroy();second?.request.destroy();reloaded?.request.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('startup without a tab expires, manual server never acquires a lifecycle lease',async()=>{
 let stopped;const done=new Promise(r=>stopped=r);const server=createServer({lifecycle:{startupMs:50,onIdle:stopped}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await done;}finally{await new Promise(r=>server.close(r));}
 const manual=createServer();await new Promise(r=>manual.listen(0,'127.0.0.1',r));
 try{assert.equal((await fetch(`http://127.0.0.1:${manual.address().port}/api/lifecycle`)).status,204);}finally{manual.closeAllConnections();await new Promise(r=>manual.close(r));}
});
test('idle shutdown aborts an active answer and persists its partial text before server closes',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'map-shutdown-'));let start,stop;const started=new Promise(r=>start=r),stopped=new Promise(r=>stop=r);
 const server=createServer({studyChatOptions:{directory,answer:async({signal,onDelta})=>{onDelta('Частичный ответ');start();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));throw Error('interrupted');}},lifecycle:{idleMs:50,startupMs:1000,onIdle:async()=>{await server.closeStudyChat();server.closeAllConnections();server.close(stop);}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const tab=await lease(base);const answer=fetch(base+'/api/study-chat?key=test',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({context:'test',message:'test'})}).then(r=>r.text());
  await started;tab.request.destroy();assert((await answer).includes('Запрос остановлен'));await stopped;
  const history=JSON.parse(readFileSync(join(directory,readdirSync(directory)[0]),'utf8'));assert.equal(history.messages[1].status,'interrupted');assert.equal(history.messages[1].text,'Частичный ответ');
 }finally{server.closeAllConnections();server.close();rmSync(directory,{recursive:true,force:true});}
});
