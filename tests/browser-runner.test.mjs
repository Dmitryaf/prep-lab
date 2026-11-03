import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const runner=fileURLToPath(new URL('../scripts/check-browser.mjs',import.meta.url));
const run=(args,env={})=>spawnSync(process.execPath,[runner,...args],{encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,...env}});

test('browser runner lists available scenarios without launching a browser',()=>{
  const result=run(['--list'],{PLAYWRIGHT_MODULE:'intentionally-unavailable-playwright'});
  assert.equal(result.status,0,result.stderr);
  const names=result.stdout.trim().split(/\r?\n/);
  assert(names.includes('projects')&&names.includes('interview-navigation'));
  assert.deepEqual(names,[...new Set(names)].sort());
});

test('unknown scenario and live-model flag are rejected before any browser starts',()=>{
  for(const args of [['missing-suite'],['--live']]){
    const result=run(args,{PLAYWRIGHT_MODULE:'intentionally-unavailable-playwright'});
    assert.equal(result.status,1);
    assert(!result.stderr.includes('Cannot find module'),result.stderr);
  }
});

test('failure in a real child scenario makes the overall command fail',()=>{
  const result=run(['project-navigation'],{PLAYWRIGHT_MODULE:'intentionally-unavailable-playwright'});
  assert.equal(result.status,1);
  assert.match(result.stdout,/project-navigation/);
  assert.match(result.stderr,/Cannot find module|ERR_MODULE_NOT_FOUND/);
});
