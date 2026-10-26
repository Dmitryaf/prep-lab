import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projects, topics } from '../dist/data.js';
import { selectReview, mergeProgressFile } from '../dist/preparation.js';

test('existing v1 progress round trips and preserves other projects', () => {
  const current = { 'tr-purpose': { status: 'done', updatedAt: '2026-10-26' } };
  const exported = JSON.stringify({ version: 1, progress: current });
  const ids = new Set(topics.map(t => t.id));
  assert.deepEqual(mergeProgressFile(exported, {}, ids), current);
  assert.equal(mergeProgressFile(exported, { 'ip-purpose': { status: 'again' } }, ids)['ip-purpose'].status, 'again');
  for (const progress of [[], null, { 'tr-purpose': { status: 'invalid' } }]) {
    assert.throws(() => mergeProgressFile(JSON.stringify({ version: 1, progress }), current, ids));
    assert.equal(current['tr-purpose'].status, 'done');
  }
  assert.throws(() => mergeProgressFile('{', current, ids));
  assert.throws(() => mergeProgressFile('{"version":2,"progress":{}}', current, ids));
});

test('weak session prioritizes marked topics and respects its time budget', () => {
  const progress = { 'tr-purpose': { status: 'done' }, 'tr-local': { status: 'again' } };
  const list = selectReview(topics, progress, { project: 'trajectory', session: 'weak' });
  assert.equal(list[0].id, 'tr-local');
  assert(!list.some(t => t.id === 'tr-purpose'));
  assert(list.every(t => t.project === 'trajectory'));
  assert(list.reduce((n, t) => n + t.minutes, 0) <= 20);
});

test('project session stays within project and all-project mode includes original topics', () => {
  const list = selectReview(topics, {}, { project: 'inbox', scope: 'both', session: 'project' });
  assert(list.length && list.every(t => t.project === 'inbox'));
  assert(list.reduce((n, t) => n + t.minutes, 0) <= 40);
  const all = selectReview(topics, {}, { scope: 'both', filter: 'all' });
  assert.equal(all.length, topics.length);
  assert(all.some(t => t.id === 'tr-purpose') && all.some(t => t.id === 'ip-purpose'));
});

test('original catalogue and routes remain available; story session fits ten minutes', () => {
  assert.equal(topics.filter(t=>t.project==='trajectory').length,17);
  assert.equal(topics.filter(t=>t.project==='inbox').length,18);
  assert.equal(projects.trajectory.routes.length,5);
  assert.equal(projects.inbox.routes.length,5);
  const stories=selectReview(topics,{}, {project:'trajectory',session:'stories'});
  assert.equal(stories.length,10);
  assert(stories.every(t=>t.story.short&&t.project==='lanit'));
});
