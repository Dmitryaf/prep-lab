import test from 'node:test';
import assert from 'node:assert/strict';
import {localCodeReference,sourceUrl,pilots} from '../dist/implementation.js';
import {topics} from '../dist/data.js';
test('local code references copy paths and locations without a source-serving URL',()=>{
  const step={project:'cokr',path:'src/app/example.vue',line:21,symbol:'saveCard'};
  assert.equal(sourceUrl(step),null);
  assert.equal(localCodeReference(step,'C:\\Work\\cokr\\'),'C:\\Work\\cokr\\src\\app\\example.vue:21\nsaveCard');
  assert.equal(localCodeReference(step),'src/app/example.vue:21\nsaveCard');
});
test('every original topic has four blocks; public links pin a verified revision and line',()=>{
  assert.equal(pilots.length,47);
  assert.deepEqual(pilots.map(p=>p.id).sort(),topics.map(t=>t.id).sort());
  for(const pilot of pilots)for(const step of pilot.code.steps){
    const url=sourceUrl(step,pilot.sourceRevision);
    if(step.project==='cokr'){assert.equal(url,null);continue;}
    assert.match(pilot.sourceRevision,/^[a-f0-9]{40}$/);
    assert(url.includes('/blob/'+pilot.sourceRevision+'/'));
    assert(url.endsWith('#L'+step.line));
  }
});
