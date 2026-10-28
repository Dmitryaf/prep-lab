import test from 'node:test';
import assert from 'node:assert/strict';
import {validateKnowledge} from './validate-knowledge.mjs';
import {canonicalNotePath} from '../src/knowledge/path.js';
test('integrity rejects wrong case and missing study links even on Windows',()=>{
  const id='Фронтенд/JavaScript/Topic';
  const bank={notes:[{id,markdown:'# Topic',category:'JavaScript'}],questions:[{id:'q',learningLinks:[{kind:'theory',noteId:id,heading:''}]}],route:['q'],warnings:[]};
  assert.deepEqual(validateKnowledge(bank,[]).problems,[]);
  const wrong=structuredClone(bank);wrong.questions[0].learningLinks[0].noteId=id.replace('JavaScript','Javascript');
  assert(validateKnowledge(wrong,[]).problems.some(p=>p.includes('Missing exact')));
  wrong.questions[0].learningLinks=[];assert(validateKnowledge(wrong,[]).problems.some(p=>p.includes('no study link')));
  wrong.notes[0].category='Инженерные вопросы';assert(validateKnowledge(wrong,[]).problems.some(p=>p.includes('Wrong category')));
});
test('only known historical note paths redirect; other case mistakes stay visible',()=>{
  assert.equal(canonicalNotePath('Фронтенд/Javascript/Topic.md'),'Фронтенд/JavaScript/Topic');
  assert.equal(canonicalNotePath('Фронтенд/Typescript/Topic.md#Example'),'Фронтенд/TypeScript/Topic#Example');
  assert.equal(canonicalNotePath('Фронтенд/JAVASCRIPT/Topic'),'Фронтенд/JAVASCRIPT/Topic');
});
