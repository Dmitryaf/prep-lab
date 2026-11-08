import { required } from "./helpers/values.ts";

import { test } from "node:test";
import assert from "node:assert/strict";
import { projectFixture } from "./fixtures/projects.ts";
import {
  projects as ownerProjects,
  topics as ownerTopics,
  ownerAvailable,
} from "./helpers/owner-package.ts";
const { topics } = projectFixture();
import {
  selectReview,
  mergeProgressFile,
  questionKey,
  questionCards,
  selectQuestionReview,
  progressSnapshot,
  mergeProgressSnapshot,
} from "#domain/projects/review.ts";

test("existing v1 progress round trips and preserves other projects", () => {
  const current = {
    "first-main": { status: "done" as const, updatedAt: "2026-10-26" },
  };
  const exported = JSON.stringify({ version: 1, progress: current });
  const ids = new Set(topics.map((t) => t.id));
  assert.deepEqual(mergeProgressFile(exported, {}, ids), current);
  assert.equal(
    mergeProgressFile(
      exported,
      { "second-main": { status: "again" as const } },
      ids,
    )["second-main"].status,
    "again",
  );
  for (const progress of [[], null, { "first-main": { status: "invalid" } }]) {
    assert.throws(() =>
      mergeProgressFile(JSON.stringify({ version: 1, progress }), current, ids),
    );
    assert.equal(current["first-main"].status, "done");
  }
  assert.throws(() => mergeProgressFile("{", current, ids));
  assert.throws(() =>
    mergeProgressFile('{"version":2,"progress":{}}', current, ids),
  );
});

test("weak session prioritizes marked topics without excluding slower topics", () => {
  const progress = {
    "first-main": { status: "done" as const },
    "first-storage": { status: "again" as const },
  };
  const list = selectReview(
    topics.map((topic) => ({ ...topic, minutes: 999 })),
    progress,
    {
      project: "first",
      session: "weak",
    },
  );
  assert.equal(list[0].id, "first-storage");
  assert(!list.some((t) => t.id === "first-main"));
  assert(list.every((t) => t.project === "first"));
  assert.equal(
    list.length,
    topics.filter((t) => t.project === "first" && t.id !== "first-main").length,
  );
});

test("project session stays within project and all-project mode includes original topics", () => {
  const list = selectReview(
    topics,
    {},
    { project: "second", scope: "both", session: "project" },
  );
  assert(list.length && list.every((t) => t.project === "second"));
  assert.equal(
    list.length,
    topics.filter((t) => t.project === "second").length,
  );
  const all = selectReview(topics, {}, { scope: "both", filter: "all" });
  assert.equal(all.length, topics.length);
  assert(
    all.some((t) => t.id === "first-main") &&
      all.some((t) => t.id === "second-main"),
  );
});

test(
  "original catalogue and routes remain available; story session fits ten minutes",
  { skip: !ownerAvailable },
  () => {
    // New scenario cards extend the catalogue without replacing the original topics.
    assert.equal(
      ownerTopics.filter(
        (t) => t.project === "trajectory" && t.id !== "tr-journal",
      ).length,
      17,
    );
    assert.equal(
      ownerTopics.filter(
        (t) =>
          t.project === "inbox" &&
          !["ip-setup", "ip-service-control"].includes(t.id),
      ).length,
      18,
    );
    assert.equal(ownerProjects.trajectory.routes.length, 5);
    assert.equal(ownerProjects.inbox.routes.length, 5);
    const stories = selectReview(
      ownerTopics,
      {},
      { project: "trajectory", session: "stories" },
    );
    assert.equal(stories.length, ownerTopics.filter((t) => t.story).length);
    assert(stories.every((t) => t.story?.short && t.project === "lanit"));
  },
);

test("full review includes every question; quick review uses the same first-question identities", () => {
  const full = selectQuestionReview(
    topics,
    {},
    { scope: "both", filter: "all" },
  );
  assert.equal(
    full.length,
    topics.reduce((count, topic) => count + topic.pilot.questions.length, 0),
  );
  assert.equal(new Set(full.map((card) => card.id)).size, full.length);
  for (const topic of topics) {
    const cards = full.filter((card) => card.topicId === topic.id);
    assert.deepEqual(
      cards.map((card) => card.questionId),
      topic.pilot.questions.map((q) => q.id),
    );
    assert(
      Math.abs(
        cards.reduce((sum, card) => sum + card.minutes, 0) - topic.minutes,
      ) < 1e-9,
    );
    const project = selectQuestionReview(
      topics,
      {},
      { project: topic.project, filter: "all" },
    );
    assert(project.every((card) => card.project === topic.project));
  }
  const quick = selectQuestionReview(
    topics,
    {},
    { scope: "both", filter: "all", mode: "quick" },
  );
  assert.equal(quick.length, topics.length);
  for (const card of quick)
    assert.equal(
      card.id,
      questionKey(
        card.topicId,
        topics.find((t) => t.id === card.topicId)!.pilot.questions[0].id,
      ),
    );
  assert.notEqual(questionKey("a/b", "c"), questionKey("a", "b/c"));
});

test("question marks affect only their question and survive question reordering", () => {
  const topic = topics[0];
  const [first, second] = questionCards([topic]);
  const marked = {
    [first.id]: { status: "done" as const },
    [second.id]: { status: "again" as const },
  };
  const weak = selectQuestionReview(topics, marked, {
    project: topic.project,
    session: "weak",
  });
  assert.equal(weak[0].id, second.id);
  assert(!weak.some((card) => card.id === first.id));
  assert.equal(
    weak.length,
    questionCards(topics).filter(
      (card) => card.project === topic.project && card.id !== first.id,
    ).length,
  );
  const fresh = selectQuestionReview([topic], marked, {
    scope: "both",
    filter: "new",
  });
  assert.equal(fresh.length, topic.pilot.questions.length - 2);
  const reordered = {
    ...topic,
    pilot: { ...topic.pilot, questions: [...topic.pilot.questions].reverse() },
  };
  assert.deepEqual(
    new Set(questionCards([reordered]).map((card) => card.id)),
    new Set(questionCards([topic]).map((card) => card.id)),
  );
  const project = selectQuestionReview(topics, marked, {
    project: topic.project,
    scope: "both",
    session: "project",
  });
  assert(project.every((card) => card.project === topic.project));
  assert.equal(
    project.length,
    questionCards(topics).filter((card) => card.project === topic.project)
      .length,
  );
});

test("v2 round trip preserves both progress namespaces; v1 import never completes questions", () => {
  const topicIds = new Set(topics.map((t) => t.id));
  const questionIds = new Set(questionCards(topics).map((q) => q.id));
  const first = questionCards(topics)[0];
  const snapshot = progressSnapshot(
    { [first.topicId]: { status: "done" as const, updatedAt: "2026-10-26" } },
    { [first.id]: { status: "again" as const, updatedAt: "2026-10-26" } },
  );
  assert.deepEqual(
    mergeProgressSnapshot(
      JSON.stringify(snapshot),
      progressSnapshot({}, {}),
      topicIds,
      questionIds,
    ),
    snapshot,
  );
  const legacy = JSON.stringify({ version: 1, progress: snapshot.progress });
  const migrated = mergeProgressSnapshot(
    legacy,
    progressSnapshot({}, {}),
    topicIds,
    questionIds,
  );
  assert.deepEqual(migrated.progress, snapshot.progress);
  assert.deepEqual(migrated.questionProgress, {});
  assert.deepEqual(
    mergeProgressSnapshot(legacy, snapshot, topicIds, questionIds),
    snapshot,
  );
  const other = required(
    questionCards(topics).find((q) => q.topicId !== first.topicId),
  );
  const merged = mergeProgressSnapshot(
    JSON.stringify(
      progressSnapshot({}, { [other.id]: { status: "done" as const } }),
    ),
    snapshot,
    topicIds,
    questionIds,
  );
  assert.equal(merged.questionProgress[first.id].status, "again");
  assert.equal(merged.questionProgress[other.id].status, "done");
});

test("invalid v2 imports reject both sections without changing either current section", () => {
  const topicIds = new Set(topics.map((t) => t.id));
  const questionIds = new Set(questionCards(topics).map((q) => q.id));
  const first = questionCards(topics)[0];
  const current = progressSnapshot(
    { [first.topicId]: { status: "again" as const } },
    { [first.id]: { status: "again" as const } },
  );
  const before = structuredClone(current);
  for (const malformed of [
    {
      version: 2,
      progress: { [first.topicId]: { status: "done" as const } },
      questionProgress: [],
    },
    {
      version: 2,
      progress: {},
      questionProgress: { [first.id]: { status: "invalid" } },
    },
    {
      version: 2,
      progress: {},
      questionProgress: {
        [first.id]: { status: "done" as const, updatedAt: 42 },
      },
    },
    { version: 2, progress: [], questionProgress: {} },
    { version: 2, progress: {} },
    { version: 3, progress: {}, questionProgress: {} },
  ]) {
    assert.throws(() =>
      mergeProgressSnapshot(
        JSON.stringify(malformed),
        current,
        topicIds,
        questionIds,
      ),
    );
    assert.deepEqual(current, before);
  }
});
