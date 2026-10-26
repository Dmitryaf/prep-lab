import test from 'node:test';
import assert from 'node:assert/strict';
import {localCodeReference,sourceUrl,pilots} from '../dist/implementation.js';
import {topics} from '../dist/data.js';
import {codeHighlights,highlightedCode,sourceContext} from '../dist/code-highlights.js';
import {renderPilot} from '../dist/topic-view.js';
test('local code references copy paths and locations without a source-serving URL',()=>{
  const step={project:'cokr',path:'src/app/example.vue',line:21,symbol:'saveCard'};
  assert.equal(sourceUrl(step),null);
  assert.equal(localCodeReference(step,'C:\\Work\\cokr\\'),'C:\\Work\\cokr\\src\\app\\example.vue:21\nsaveCard');
  assert.equal(localCodeReference(step),'src/app/example.vue:21\nsaveCard');
});
test('every original topic has four blocks; public links pin a verified revision and line',()=>{
  assert.equal(pilots.length,50);
  assert.deepEqual(pilots.map(p=>p.id).sort(),topics.map(t=>t.id).sort());
  for(const pilot of pilots)for(const step of pilot.code.steps){
    const url=sourceUrl(step,pilot.sourceRevision);
    if(step.project==='cokr'){assert.equal(url,null);continue;}
    assert.match(pilot.sourceRevision,/^[a-f0-9]{40}$/);
    assert(url.includes('/blob/'+pilot.sourceRevision+'/'));
    assert(url.endsWith('#L'+step.line));
  }
});

test('editorial highlights resolve real steps and preserve original copy indices',()=>{
  for(const [id,symbols] of Object.entries(codeHighlights)){
    const pilot=pilots.find(p=>p.id===id);
    assert(pilot,'Unknown highlighted topic: '+id);
    assert(symbols.length>=4&&symbols.length<=5);
    const selection=highlightedCode(pilot);
    assert.equal(selection.length,symbols.length,'Unresolved or repeated symbol: '+id);
    for(const {step,index} of selection)assert.equal(pilot.code.steps[index],step);
    const markup=renderPilot({pilot},{esc:String,knowledgeUrl:String,root:''});
    assert(markup.includes('class="further code-full"'));
    const full=markup.slice(markup.indexOf('class="further code-full"'));
    for(const [index,step] of pilot.code.steps.entries()){
      assert(full.includes(step.path));
      if(step.project==='cokr')assert(full.includes(`data-index="${index}"`));
    }
  }
  assert.equal(sourceContext({project:'trajectory'}),'');
  assert.equal(sourceContext({project:'cokr',path:'src/app/extensions/platform.ts'}),'Модуль extensions');
  assert.equal(sourceContext({project:'cokr',path:'src/assets/cokr-front/templates/medo.vue'}),'Шаблон Landocs');
});
