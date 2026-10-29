import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {createDevelopmentServer} from './dev.mjs';
import {resolve} from 'node:path';
import {loadKnowledge} from '../server/knowledge.mjs';
test('Vue development entry serves app and readonly API without exposing private workspace files',async()=>{
  const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const dev=await createDevelopmentServer({port}),base=`http://127.0.0.1:${port}`;
  try{
    assert.equal((await fetch(base+'/')).status,200);
    assert((await (await fetch(base+'/src/main.ts')).text()).includes('createApp'));
    const bank=await (await fetch(base+'/api/knowledge')).json();
    const expected=loadKnowledge(resolve(process.env.CAREER_KNOWLEDGE_ROOT||'../career-knowledge'));
    assert.deepEqual(bank.questions.map(q=>q.id),expected.questions.map(q=>q.id));assert.deepEqual(bank.warnings,[]);
    for(const path of ['/AGENTS.md','/server/knowledge.mjs','/docs/interview-content-review.md','/artifacts/interview-study-20261028/report.html','/@fs/'+resolve('AGENTS.md').replaceAll('\\','/')])assert([403,404].includes((await fetch(base+path)).status),path);
    assert.equal((await fetch(base+'/api/knowledge',{method:'POST'})).status,405);
  }finally{await dev.close();}
});
