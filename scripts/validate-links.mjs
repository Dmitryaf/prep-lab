import assert from 'node:assert/strict';
import {existsSync,statSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {projects,topics} from '../dist/data.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repositories=process.env.PROJECT_SOURCES_ROOT||resolve(root,'..');
let count=0;
function check(base,path,label){
  const absolute=resolve(base,path);
  assert(absolute.startsWith(resolve(base)+sep),`Path escapes source root: ${label}`);
  assert(existsSync(absolute),`Missing ${label}: ${absolute}`);
  count++;
  return absolute;
}
for(const topic of topics){
  for(const [path] of topic.sources)check(resolve(repositories,projects[topic.project].repo),path,topic.id);
  for(const [path] of topic.theory)check(resolve(repositories,'career-knowledge'),path,topic.id);
  for(const [path] of topic.code||[])assert(statSync(check(root,path,topic.id)).isFile());
}
console.log(`PASS ${count} local source/knowledge/code references. GitHub availability is not checked.`);
