import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {loadKnowledge,headings} from './knowledge.mjs';
import {topics} from '../src/projects/catalog/data.js';
import {projectQuestions} from '../src/projects/questions.js';

export function validateKnowledge(bank,topicList) {
  const notes=new Map(bank.notes.map(n=>[n.id,n]));
  const problems=[...bank.warnings];let count=0;
  const check=(path,heading='',label=path)=>{
    const id=path.replace(/\.md$/,'');const note=notes.get(id);count++;
    if(!note)problems.push(`Missing exact knowledge path: ${label} → ${id}`);
    else if(heading&&!headings(note.markdown).some(h=>[h.title,[...h.parents.slice(1),h.title].join('#')].includes(heading)))problems.push(`Missing heading: ${id}#${heading}`);
  };
  for(const t of topicList){
    for(const [p] of t.theory||[])check(p,'',t.id);
    for(const n of t.pilot?.study||[])check(n.path,'',t.id);
    if(t.project==='lanit')for(const [p] of t.sources||[])check(p,'',t.id);
  }
  for(const q of [...bank.questions,...projectQuestions(topicList)])for(const l of q.learningLinks||[])check(l.noteId,l.heading,q.id);
  for(const id of bank.route){const q=bank.questions.find(q=>q.id===id);if(!q?.learningLinks?.some(l=>l.kind==='theory'))problems.push(`Core question has no study link: ${id}`);}
  for(const n of bank.notes){
    const section=/^Фронтенд\/(JavaScript|TypeScript)\//.exec(n.id)?.[1];
    if(section&&n.category!==section)problems.push(`Wrong category: ${n.id} → ${n.category}`);
    if(/^Фронтенд\/(Javascript|Typescript)\//.test(n.id))problems.push(`Noncanonical directory: ${n.id}`);
  }
  return {problems,count};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const root=resolve(process.env.CAREER_KNOWLEDGE_ROOT||'../career-knowledge');
  // Catch case-only changes that Windows accepts but a fresh checkout cannot reproduce.
  const paths=execFileSync('git',['-C',root,'ls-files','-z'],{encoding:'utf8'}).split('\0');
  assert(!paths.some(p=>/^Фронтенд\/(Javascript|Typescript)\//.test(p)),'Git index retains noncanonical directory case');
  const {problems,count}=validateKnowledge(loadKnowledge(root),topics);
  assert.deepEqual(problems,[]);
  console.log(`PASS ${count} exact cross-repository study links, core coverage, categories and Git path casing`);
}
