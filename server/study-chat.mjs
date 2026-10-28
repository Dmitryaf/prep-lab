import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {Codex} from './codex.mjs';

const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
export function createStudyChat({directory=resolve('artifacts/study-chats'),answer}={}){
  const active=new Map(),idleWaiters=new Set();let codex;
  const pathFor=key=>join(directory,createHash('sha256').update(key).digest('hex')+'.json');
  const read=key=>{
    let raw;try{raw=readFileSync(pathFor(key),'utf8');}catch(e){if(e.code==='ENOENT')return {key,messages:[]};throw e;}
    const data=JSON.parse(raw);
    if(data.key!==key||!Array.isArray(data.messages)||!data.messages.every(m=>['user','assistant'].includes(m.role)&&typeof m.text==='string'&&['completed','pending','failed','interrupted'].includes(m.status)))throw Error('История обсуждения повреждена. Файл сохранён для восстановления.');
    return data;
  };
  const save=data=>{mkdirSync(directory,{recursive:true});const path=pathFor(data.key);writeFileSync(path+'.tmp',JSON.stringify(data),'utf8');renameSync(path+'.tmp',path);};
  async function handle(req,res){
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/api/study-chat'))return false;
    const key=url.searchParams.get('key');
    if(!key||key.length>500||!['/api/study-chat','/api/study-chat/cancel'].includes(url.pathname)){json(res,400,{error:'Некорректная тема обсуждения.'});return true;}
    try{
      if(req.method==='GET'&&url.pathname==='/api/study-chat'){
        const data=read(key);let changed=false;
        if(!active.has(key))for(const m of data.messages)if(m.status==='pending'){m.status='interrupted';changed=true;}
        if(changed)save(data);
        json(res,200,{...data,busy:active.has(key)});return true;
      }
      if(req.method!=='POST'){json(res,405,{error:'Метод не разрешён.'});return true;}
      if(req.headers.origin!==`http://${req.headers.host}`||!req.headers['content-type']?.startsWith('application/json')){json(res,403,{error:'Запрос не разрешён.'});return true;}
      if(url.pathname.endsWith('/cancel')){active.get(key)?.abort();json(res,200,{ok:true});return true;}
      if(active.size){json(res,409,{error:'Codex уже отвечает. Дождитесь ответа или остановите текущий запрос.'});return true;}
      req.setEncoding('utf8');
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>400000){json(res,413,{error:'Материал слишком большой.'});return true;}}
      const input=JSON.parse(raw);
      if(typeof input.message!=='string'||!input.message.trim()||input.message.length>8000||typeof input.context!=='string'||input.context.length>80000){json(res,400,{error:'Проверьте сообщение и материал.'});return true;}
      // Recheck after asynchronous body reading: two tabs cannot start concurrent turns.
      if(active.size){json(res,409,{error:'Codex уже отвечает.'});return true;}
      const data=read(key);
      if(JSON.stringify(data.messages).length>350000){json(res,413,{error:'Обсуждение достигло лимита длины. История сохранена.'});return true;}
      for(const m of data.messages)if(m.status==='pending')m.status='interrupted';
      const user={role:'user',text:input.message.trim(),status:'completed'};
      const reply={role:'assistant',text:'',status:'pending'};
      data.messages.push(user,reply);save(data);
      const controller=new AbortController();active.set(key,controller);
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      const emit=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n');};
      // A closed tab cancels generation, never silently replays a paid/limited request.
      const disconnected=()=>controller.abort();res.on('close',disconnected);
      try{
        const generate=answer||((args)=>{codex??=new Codex();return codex.answer(args).catch(error=>{codex?.close();codex=undefined;throw error;});});
        reply.text=await generate({context:input.context,messages:data.messages.filter(m=>m!==reply&&m.status==='completed'),signal:controller.signal,onDelta:delta=>{reply.text+=delta;emit({delta});}});
        reply.status='completed';save(data);emit({done:true});
      }catch(e){reply.status=controller.signal.aborted?'interrupted':'failed';try{save(data);}catch{emit({error:'Не удалось сохранить ответ на диске. Текст остаётся в открытой панели.'});}emit({error:controller.signal.aborted?'Запрос остановлен.':e.message});}
      finally{active.delete(key);if(!active.size){for(const done of idleWaiters)done();idleWaiters.clear();}res.off('close',disconnected);res.end();}
    }catch(e){if(!res.headersSent)json(res,500,{error:e instanceof SyntaxError?'Не удалось прочитать данные обсуждения. Существующая история не изменена.':e.message});else res.end();}
    return true;
  }
  return {handle,async close(){for(const c of active.values())c.abort();codex?.close();if(active.size)await new Promise(done=>idleWaiters.add(done));}};
}
