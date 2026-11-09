import assert from "node:assert/strict";
import { projects, topics } from "#server/infrastructure/projects/owner.ts";

const ids = new Set();
for (const topic of topics) {
  assert(!ids.has(topic.id), "Duplicate topic: " + topic.id);
  ids.add(topic.id);
  assert(projects[topic.project], "Unknown project: " + topic.id);
  assert(
    ["P0", "P1", "P2"].includes(topic.priority),
    "Bad priority: " + topic.id,
  );
  assert(
    topic.title && topic.summary && topic.question && topic.answer,
    "Missing content: " + topic.id,
  );
  assert(topic.mechanism.length > 0, "Missing mechanism: " + topic.id);
  assert(
    Number.isFinite(topic.minutes) && topic.minutes > 0,
    "Bad duration: " + topic.id,
  );
  assert(
    topic.context &&
      topic.decision &&
      topic.failures?.length &&
      topic.interview?.length,
    "Incomplete explanation: " + topic.id,
  );
  if (topic.story) {
    assert(topic.story.short.trim(), "Missing short story: " + topic.id);
    assert(topic.story.deep.length > 0, "Missing long story: " + topic.id);
    assert(
      topic.context &&
        topic.decision &&
        topic.failures?.length &&
        topic.interview?.length,
      "Incomplete study material: " + topic.id,
    );
  }
  assert(topic.pilot, "Topic not migrated: " + topic.id);
  if (topic.pilot) {
    const p = topic.pilot;
    assert(
      p.explanation.intro && p.explanation.steps.length >= 3,
      "Missing explanation: " + topic.id,
    );
    assert(
      p.study.length >= 1 && p.study.length <= 6,
      "Study list size: " + topic.id,
    );
    assert(p.questions.length >= 1, "Missing questions: " + topic.id);
    for (const q of p.questions)
      assert(
        q.id && q.question && q.short && q.detailed.length && q.example,
        "Incomplete answer: " + topic.id,
      );
    assert(
      new Set(p.questions.map((q) => q.id)).size === p.questions.length,
      "Question IDs: " + topic.id,
    );
    assert(
      p.code.steps.length > 0 || p.code.limitations,
      "Missing code explanation: " + topic.id,
    );
    for (const step of [...p.code.steps, ...p.code.tests]) {
      assert(
        step.project === "cokr" || Object.hasOwn(projects, step.project),
        "Unknown code project",
      );
      assert(
        step.path &&
          !step.path.includes("..") &&
          step.symbol &&
          Number.isInteger(step.line) &&
          step.line > 0 &&
          step.explanation,
        "Invalid code reference: " + topic.id,
      );
    }
  }
  assert(topic.sources.length > 0, "Missing source: " + topic.id);
  for (const [path, label] of [...topic.sources, ...topic.theory]) {
    assert(path && label && !path.includes(".."), "Invalid link: " + topic.id);
  }
}

for (const topic of topics) {
  for (const related of topic.related) {
    assert(ids.has(related), "Broken relation: " + topic.id + " → " + related);
  }
}

for (const project of Object.values(projects)) {
  assert(project.routes.length > 0, "No routes: " + project.id);
  for (const route of project.routes) {
    for (const node of route.nodes) {
      assert(ids.has(node), "Missing route node: " + route.id + " → " + node);
      assert(
        topics.find((t) => t.id === node)!.project === project.id,
        "Cross-project route: " + route.id,
      );
    }
  }
}

const totalSources = topics.reduce(
  (sum, topic) => sum + topic.sources.length,
  0,
);
const totalTheory = topics.reduce((sum, topic) => sum + topic.theory.length, 0);
console.log(
  "✓ " +
    topics.length +
    " topics, " +
    Object.values(projects).reduce((sum, p) => sum + p.routes.length, 0) +
    " routes, " +
    totalSources +
    " source links, " +
    totalTheory +
    " knowledge links",
);
