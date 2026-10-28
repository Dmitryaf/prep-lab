import test from 'node:test';
import assert from 'node:assert/strict';
import {loadState,saveState,importState,exportState,rateQuestion,dailySession,createSession,selectInterview,localDate,storageKey} from '../dist/platform-state.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
const categories=['JavaScript','TypeScript','Vue','Браузер, HTML и CSS','Сети и безопасность','Архитектура, производительность и тестирование'];
const qs=categories.flatMap(category=>Array.from({length:10},(_,i)=>({id:`${category}/${i}`,title:`Q${i}`,prompt:'Question',answer:'Answer',category,kind:'theory',source:'knowledge'})));
qs.push({id:'task',title:'Task',prompt:'Solve',answer:'Solution',category:'JavaScript',kind:'practice',source:'knowledge'},{id:'design',title:'Design',prompt:'Design',answer:'Criteria',category:'Design',kind:'design',source:'knowledge'},{id:'personal',title:'Known project',prompt:'Private story',answer:'Answer',kind:'project',source:'projects',category:'JavaScript'});
test('v1/v2 migrate without marking questions; unavailable IDs retained in exports',()=>{const storage=memory();storage.setItem('project-map-review-v1',JSON.stringify({topic:{status:'done'}}));let state=loadState(storage);assert.deepEqual(state.questionProgress,{});state=rateQuestion(state,'missing-source/question','partial');saveState(state,storage);assert.deepEqual(loadState(storage),state);assert.deepEqual(importState(exportState(state),loadState(memory())),state);assert.equal(JSON.parse(storage.getItem('project-map-review-v1')).topic.status,'done');});
test('invalid import and failed writes preserve prior state',()=>{const storage=memory();const state=loadState(storage);saveState(state,storage);const before=storage.getItem(storageKey);for(const value of ['{',JSON.stringify({version:3,progress:{},questionProgress:{x:{status:'bad'}}}),JSON.stringify({...state,sessions:{bad:{}}})])assert.throws(()=>importState(value,state));assert.equal(storage.getItem(storageKey),before);assert.throws(()=>saveState(state,{setItem(){throw Error('Quota');}}));storage.setItem(storageKey,'{broken');assert.throws(()=>loadState(storage));});
test('daily balanced stable snapshot survives bank edits and progress changes',()=>{let state=dailySession(loadState(memory()),qs,'2026-10-28');const s=state.daily['2026-10-28'];assert.equal(new Set(s.questionIds).size,s.questionIds.length);assert(!s.questionIds.includes('personal'));for(const c of categories)assert(s.questionIds.some(id=>s.snapshots[id].category===c));state=rateQuestion(state,qs[3].id,'again');assert.equal(dailySession(state,[],'2026-10-28'),state);const tomorrow=dailySession(state,qs,'2026-10-29').daily['2026-10-29'];assert.notDeepEqual(s.questionIds,tomorrow.questionIds);const restored=importState(exportState(state),loadState(memory()));assert.deepEqual(restored.daily,state.daily);});
test('full includes practice and design; personal/behavioral excluded',()=>{const s=createSession(qs);assert(s.questionIds.includes('task'));assert(s.questionIds.includes('design'));assert(!s.questionIds.includes('personal'));assert.equal(localDate(new Date(2026,9,28,0,1)),'2026-10-28');assert.equal(selectInterview([], 'daily','2026-10-28').length,0);});

test('v2 storage migrates both namespaces without changing its source',()=>{const storage=memory();const v2={version:2,progress:{topic:{status:'done',updatedAt:'old'}},questionProgress:{question:{status:'again',updatedAt:'old'}}};storage.setItem('project-map-review-v2',JSON.stringify(v2));const state=loadState(storage);assert.deepEqual(state.progress,v2.progress);assert.deepEqual(state.questionProgress,v2.questionProgress);saveState(state,storage);assert.deepEqual(JSON.parse(storage.getItem('project-map-review-v2')),v2);});

test('malformed snapshot and followup positions reject the whole import',()=>{const current=dailySession(loadState(memory()),qs,'2026-10-28');for(const mutate of [s=>{s.snapshots[s.questionIds[0]].followups='text';},s=>{s.snapshots[s.questionIds[0]].followupAnswers=[null];},s=>{s.followupIndex=999;},s=>{s.index=s.questionIds.length;}]){const bad=structuredClone(current);mutate(bad.daily['2026-10-28']);assert.throws(()=>importState(JSON.stringify(bad),current));}assert.equal(current.daily['2026-10-28'].index,0);});

test('general interviews stay in the explicit curriculum, including marked gaps and design',()=>{
  const bank=qs.map(q=>({...q,curriculumTier:'core'}));
  bank.push({...qs[0],id:'obscure',curriculumTier:'extended'},{...qs[0],id:'react-only',curriculumTier:'vacancy'},{...qs.at(-2),id:'backend-design',curriculumTier:'extended'});
  for(const kind of ['daily','full'])for(let i=0;i<30;i++){
    const selected=selectInterview(bank,kind,String(i),[],{obscure:{status:'again'}});
    assert(selected.length>6);assert(selected.every(q=>q.curriculumTier==='core'&&q.source!=='projects'));
    assert(!selected.some(q=>['obscure','react-only','backend-design'].includes(q.id)));
  }
});
test('new study links and criteria survive snapshots; malformed metadata rejects atomically',()=>{
  const bank=qs.map(q=>({...q,curriculumTier:'core',criteria:'Объяснить причину',learningLinks:[{kind:'theory',noteId:'Фронтенд/Тема',heading:'Пример',label:'Разбор'}]}));
  const current=dailySession(loadState(memory()),bank,'2026-10-28');
  const before=exportState(current);assert.deepEqual(importState(before,loadState(memory())),current);
  for(const value of [null,[null],[{kind:'script',noteId:'x',heading:'',label:'x'}]]){
    const bad=JSON.parse(before),s=bad.daily['2026-10-28'];s.snapshots[s.questionIds[0]].learningLinks=value;
    assert.throws(()=>importState(JSON.stringify(bad),current));assert.equal(exportState(current),before);
  }
});

test('testing and engineering theory participate in the engineering section of the curriculum',()=>{
  const bank=qs.map(q=>({...q,curriculumTier:'core'}));
  for(const category of ['Тестирование','Инженерные вопросы'])bank.push({...qs[0],id:category,category,curriculumTier:'core'});
  const seen=new Set();
  for(let i=0;i<120;i++)for(const q of selectInterview(bank,'daily',String(i)))seen.add(q.id);
  assert(seen.has('Тестирование'));assert(seen.has('Инженерные вопросы'));
  const selected=selectInterview(bank,'daily','gap',[],{'Тестирование':{status:'again'},'Инженерные вопросы':{status:'partial'}});
  assert(selected.some(q=>q.id==='Тестирование'));assert(selected.some(q=>q.id==='Инженерные вопросы'));
});
