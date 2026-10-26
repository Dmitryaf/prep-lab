import assert from 'node:assert/strict';
import { projects, topics } from '../dist/data.js';

const ids = new Set();
for (const topic of topics) {
  assert(!ids.has(topic.id), 'Duplicate topic: ' + topic.id);
  ids.add(topic.id);
  assert(projects[topic.project], 'Unknown project: ' + topic.id);
  assert(['P0', 'P1', 'P2'].includes(topic.priority), 'Bad priority: ' + topic.id);
  assert(topic.title && topic.summary && topic.question && topic.answer, 'Missing content: ' + topic.id);
  assert(topic.mechanism.length > 0, 'Missing mechanism: ' + topic.id);
  assert(Number.isFinite(topic.minutes) && topic.minutes > 0, 'Bad duration: ' + topic.id);
  assert(topic.context && topic.decision && topic.failures.length && topic.interview.length, 'Incomplete explanation: ' + topic.id);
  if (topic.story) {
    for (const field of ['confirmed','reconstruction','assumptions','short','boundaries']) assert(topic.story[field], 'Missing story ' + field + ': ' + topic.id);
    assert(topic.story.deep.length > 0, 'Missing long story: ' + topic.id);
    assert(topic.context && topic.decision && topic.failures.length && topic.interview.length, 'Incomplete study material: ' + topic.id);
    assert(topic.code.length && topic.implementation.status === 'implemented', 'Unlinked lab: ' + topic.id);
  }
  assert(topic.sources.length > 0, 'Missing source: ' + topic.id);
  for (const [path, label] of [...topic.sources, ...topic.theory]) {
    assert(path && label && !path.includes('..'), 'Invalid link: ' + topic.id);
  }
}

for (const topic of topics) {
  for (const related of topic.related) {
    assert(ids.has(related), 'Broken relation: ' + topic.id + ' → ' + related);
  }
}

for (const project of Object.values(projects)) {
  assert(project.routes.length > 0, 'No routes: ' + project.id);
  for (const route of project.routes) {
    for (const node of route.nodes) {
      assert(ids.has(node), 'Missing route node: ' + route.id + ' → ' + node);
      assert(topics.find(t => t.id === node).project === project.id, 'Cross-project route: ' + route.id);
    }
  }
}

const totalSources = topics.reduce((sum, topic) => sum + topic.sources.length, 0);
const totalTheory = topics.reduce((sum, topic) => sum + topic.theory.length, 0);
console.log('✓ ' + topics.length + ' topics, ' + Object.values(projects).reduce((sum, p) => sum + p.routes.length, 0) + ' routes, ' + totalSources + ' source links, ' + totalTheory + ' knowledge links');
