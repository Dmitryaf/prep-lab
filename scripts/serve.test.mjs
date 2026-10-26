import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './serve.mjs';
test('static server serves only the map, never old data, code repositories or mutations',async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const path of ['/','/app.js','/implementation.js','/pilots/trajectory.js']){
      const r=await fetch(base+path);assert.equal(r.status,200,path);assert((await r.text()).length>30);
    }
    for(const path of ['/lab/','/lab/.data/lab.sqlite','/api/state','/source/lab/domain.mjs','/source/cokr/src/app.ts','/%2e%2e%5cAGENTS.md','/C:/private/project/package.json']){
      const r=await fetch(base+path);assert([403,404].includes(r.status),path);
    }
    assert.equal((await fetch(base+'/app.js',{method:'POST',body:'x'})).status,405);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
