import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from './serve.mjs';

async function fixture(answer,run){
 const directory=mkdtempSync(join(tmpdir(),'study-chat-'));
 const server=createServer({studyChatOptions:{directory,answer}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`,path='/api/study-chat?key=question:test';
 const post=(data,extra={})=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(data),...extra});
 try{await run({directory,base,path,post});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(directory,{recursive:true,force:true});}
}
test('real HTTP boundary: stream, persisted continuation, rejected origin/input and corruption preserve history',async()=>{
 let calls=0;
 await fixture(async({messages,context,onDelta})=>{calls++;assert.equal(context,'Promise');assert.equal(messages.at(-1).text,calls===1?'Первый':'Уточнение');if(calls===2)assert(messages.some(m=>m.text==='Объяснение'));onDelta('Объяс');onDelta('нение');return 'Объяснение';},async({directory,base,path,post})=>{
   let response=await post({context:'Promise',message:'Первый'});assert.equal(response.status,200);assert((await response.text()).includes('"done":true'));
   const read=async()=>await (await fetch(base+path)).json();assert.equal((await read()).messages[1].text,'Объяснение');
   response=await post({context:'Promise',message:'Уточнение'});await response.text();assert.equal((await read()).messages.length,4);
   const before=readFileSync(join(directory,readdirSync(directory)[0]),'utf8');
   assert.equal((await post({message:'bad',context:'x'},{headers:{Origin:'https://evil.invalid','Content-Type':'application/json'}})).status,403);
   assert.equal((await post({message:'',context:'x'})).status,400);
   assert.equal((await post({message:'x',context:'x'},{headers:{'Content-Type':'application/json'}})).status,403);
   assert.equal(readFileSync(join(directory,readdirSync(directory)[0]),'utf8'),before);assert.equal(calls,2);
   writeFileSync(join(directory,readdirSync(directory)[0]),'{broken');assert.equal((await fetch(base+path)).status,500);assert.equal((await post({message:'x',context:'x'})).status,500);assert.equal(readFileSync(join(directory,readdirSync(directory)[0]),'utf8'),'{broken');
 });
});
test('cancel and concurrent request: partial history survives, no automatic retry',async()=>{
 let started;const ready=new Promise(r=>started=r);let calls=0;
 await fixture(async({onDelta,signal})=>{calls++;onDelta('Часть ответа');started();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));throw Error('stopped');},async({base,path,post})=>{
   const first=post({context:'Promise',message:'Первый'});await Promise.race([ready,first.then(()=>{throw Error('Запрос завершился до начала генерации');})]);
   assert.equal((await post({context:'Promise',message:'Второй'})).status,409);
   await fetch(base+'/api/study-chat/cancel?key=question:test',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
   assert((await (await first).text()).includes('Запрос остановлен'));
   const data=await (await fetch(base+path)).json();assert.equal(data.busy,false);assert.equal(data.messages[1].text,'Часть ответа');assert.equal(data.messages[1].status,'interrupted');assert.equal(calls,1);
 });
});
test('startup recovers pending answer as interrupted without sending it again',async()=>{
 await fixture(async()=>{throw Error('unreachable')},async({base,path,post,directory})=>{
   await (await post({context:'x',message:'x'})).text();const file=join(directory,readdirSync(directory)[0]);const data=JSON.parse(readFileSync(file));data.messages[1].status='pending';data.messages[1].text='Partial';writeFileSync(file,JSON.stringify(data));
   const restored=await (await fetch(base+path)).json();assert.equal(restored.messages[1].status,'interrupted');assert.equal(restored.messages[1].text,'Partial');
 });
});
