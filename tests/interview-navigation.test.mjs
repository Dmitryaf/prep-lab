import test from 'node:test';
import assert from 'node:assert/strict';
import {previousQuestion, advanceQuestion, openFollowup, availableFollowups, loadState, saveState, storageKey} from '../src/progress/engine.js';

const session = kind => ({id:kind==='daily'?'daily:2026-11-03':'full:test',kind,date:'2026-11-03',
  questionIds:['one','two','three'], index:0, finished:false, skipped:['two'], ratings:{one:'partial',two:'again'}, reviewed:['one','two'],
  snapshots:Object.fromEntries(['one','two','three'].map(id=>[id,{id,title:id,prompt:id,answer:'Answer',followups:['Why?','When?']}]))});

test('previous main question preserves answers, ratings and skips without changing its input', () => {
  for (const kind of ['daily','full']) {
    const original = {...session(kind), index:2}, before = structuredClone(original);
    const previous = previousQuestion(original);
    assert.equal(previous.index,1);
    assert.equal(previous.followupIndex,0);
    assert.deepEqual(original,before);
    assert.deepEqual({...previous,index:2,followupIndex:undefined},{...original,followupIndex:undefined});
    assert.equal(advanceQuestion(previous).index,2);
  }
});

test('previous from a followup returns to its main topic without restoring its allowance', () => {
  for (const kind of ['daily','full']) {
    const opened = openFollowup({...session(kind),index:1});
    const previous = previousQuestion(opened);
    assert.equal(previous.index,1);
    assert.equal(previous.followupIndex,0);
    assert.deepEqual(previous.followupChoices,opened.followupChoices);
    assert.deepEqual(availableFollowups(previous),availableFollowups(opened));
    const earlier = previousQuestion(previous);
    assert.equal(earlier.index,0);
    assert.deepEqual(advanceQuestion(earlier).followupChoices,opened.followupChoices);
  }
});

test('first topic and completed interviews do not go backwards', () => {
  const first = session('daily');
  assert.equal(previousQuestion(first),first);
  const finished = {...first,index:3,finished:true};
  assert.equal(previousQuestion(finished),finished);
  const opened = openFollowup(first);
  assert.equal(previousQuestion(opened).index,0);
  assert.equal(previousQuestion(opened).followupIndex,0);
});

test('legacy followup allowance stays used after either direct return or forward/back navigation', () => {
  for (const kind of ['daily','full']) {
    const legacy={...session(kind),index:1,followupIndex:3};
    legacy.snapshots.two.followups=['a','b','c','d'];
    const before=structuredClone(legacy);
    for (const result of [previousQuestion(legacy), previousQuestion(advanceQuestion(legacy))]) {
      assert.equal(result.index,1);
      assert.deepEqual(result.followupChoices.two,[0,1,2]);
      assert.deepEqual(availableFollowups(result),[]);
    }
    assert.deepEqual(legacy,before);
  }
});

test('backward navigation survives validation and storage reload in both interview kinds', () => {
  for (const kind of ['daily','full']) {
    const moved = previousQuestion(openFollowup({...session(kind),index:2}));
    const state = loadState({getItem:()=>null});
    if (kind==='daily') state.daily[moved.date]=moved;
    else state.sessions[moved.id]=moved;
    state.activeSession=moved.id;
    let stored;
    const storage={getItem:key=>key===storageKey?stored:null,setItem:(key,text)=>{stored=text;}};
    saveState(state,storage);
    assert.deepEqual(loadState(storage),state);
  }
});
