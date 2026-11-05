import type { Interview } from "../domain/interview/state.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  previousQuestion,
  advanceQuestion,
  finishInterview,
  openFollowup,
  availableFollowups,
  loadState,
  saveState,
  storageKey,
} from "../domain/interview/engine.ts";

const session = (kind: Interview["kind"]): Interview => ({
  id: kind === "daily" ? "daily:2026-11-03" : "full:test",
  kind,
  date: "2026-11-03",
  questionIds: ["one", "two", "three"],
  index: 0,
  finished: false,
  skipped: ["two"],
  ratings: { one: "partial", two: "again" },
  reviewed: ["one", "two"],
  snapshots: Object.fromEntries(
    ["one", "two", "three"].map((id) => [
      id,
      {
        id,
        title: id,
        prompt: id,
        answer: "Answer",
        kind: "theory",
        source: "knowledge",
        category: "JavaScript",
        followups: ["Why?", "When?"],
      },
    ]),
  ),
});

test("previous main question preserves answers, ratings and skips without changing its input", () => {
  for (const kind of ["daily", "full"] as const) {
    const original = { ...session(kind), index: 2 },
      before = structuredClone(original);
    const previous = previousQuestion(original);
    assert.equal(previous.index, 1);
    assert.equal(previous.followupIndex, 0);
    assert.deepEqual(original, before);
    assert.deepEqual(
      { ...previous, index: 2, followupIndex: undefined },
      { ...original, followupIndex: undefined },
    );
    assert.equal(advanceQuestion(previous).index, 2);
  }
});

test("previous from a followup returns to its main topic without restoring its allowance", () => {
  for (const kind of ["daily", "full"] as const) {
    const opened = openFollowup({ ...session(kind), index: 1 });
    const previous = previousQuestion(opened);
    assert.equal(previous.index, 1);
    assert.equal(previous.followupIndex, 0);
    assert.deepEqual(previous.followupChoices, opened.followupChoices);
    assert.deepEqual(availableFollowups(previous), availableFollowups(opened));
    const earlier = previousQuestion(previous);
    assert.equal(earlier.index, 0);
    assert.deepEqual(
      advanceQuestion(earlier).followupChoices,
      opened.followupChoices,
    );
  }
});

test("first topic and completed interviews do not go backwards", () => {
  const first = session("daily");
  assert.equal(previousQuestion(first), first);
  const finished = { ...first, index: 3, finished: true };
  assert.equal(previousQuestion(finished), finished);
  const opened = openFollowup(first);
  assert.equal(previousQuestion(opened).index, 0);
  assert.equal(previousQuestion(opened).followupIndex, 0);
});

test("legacy followup allowance stays used after either direct return or forward/back navigation", () => {
  for (const kind of ["daily", "full"] as const) {
    const legacy = { ...session(kind), index: 1, followupIndex: 3 };
    legacy.snapshots.two.followups = ["a", "b", "c", "d"];
    const before = structuredClone(legacy);
    for (const result of [
      previousQuestion(legacy),
      previousQuestion(advanceQuestion(legacy)),
    ]) {
      assert.equal(result.index, 1);
      assert.deepEqual(result.followupChoices!.two, [0, 1, 2]);
      assert.deepEqual(availableFollowups(result), []);
    }
    assert.deepEqual(legacy, before);
  }
});

test("backward navigation survives validation and storage reload in both interview kinds", () => {
  for (const kind of ["daily", "full"] as const) {
    const moved = previousQuestion(
      openFollowup({ ...session(kind), index: 2 }),
    );
    const state = loadState({ getItem: () => null });
    if (kind === "daily") state.daily[moved.date] = moved;
    else state.sessions[moved.id] = moved;
    state.activeSession = moved.id;
    let stored: string | null = null;
    const storage = {
      getItem: (key: string) => (key === storageKey ? stored : null),
      setItem: (key: string, text: string) => {
        stored = text;
      },
    };
    saveState(state, storage);
    assert.deepEqual(loadState(storage), state);
  }
});

test("finish ends any active step without guessing skipped or unanswered questions", () => {
  for (const kind of ["daily", "full"] as const) {
    for (const index of [0, 1, 2]) {
      const original: Interview = {
        ...session(kind),
        index,
        format: "review",
        attempts: {
          one: {
            text: "Мой ответ",
            solutionUrl: "",
            updatedAt: "2026-11-05T10:00:00Z",
          },
        },
        followupChoices: { one: [0] },
      };
      const before = structuredClone(original);
      const finished = finishInterview(original);
      assert.deepEqual(finished, {
        ...before,
        finished: true,
        index: 3,
        followupIndex: 0,
      });
      assert.deepEqual(original, before);
      assert.notEqual(finished, original);
      assert.notEqual(finished.snapshots, original.snapshots);
      assert.notEqual(finished.attempts, original.attempts);
      assert.deepEqual(finished.skipped, ["two"]);
      assert.deepEqual(availableFollowups(finished), []);
      assert.equal(finishInterview(finished), finished);
    }
  }
});

test("finishing a legacy followup preserves its allowance and survives reload", () => {
  for (const kind of ["daily", "full"] as const) {
    const original = { ...session(kind), index: 1, followupIndex: 3 };
    original.snapshots.two.followups = ["a", "b", "c", "d"];
    const before = structuredClone(original);
    const finished = finishInterview(original);
    assert.deepEqual(original, before);
    assert.deepEqual(finished.followupChoices, { two: [0, 1, 2] });
    assert.equal(finished.followupIndex, 0);
    const state = loadState({ getItem: () => null });
    if (kind === "daily") state.daily[finished.date] = finished;
    else state.sessions[finished.id] = finished;
    state.activeSession = finished.id;
    let stored = "";
    saveState(state, {
      setItem: (_key, value) => {
        stored = value;
      },
    });
    assert.deepEqual(
      loadState({ getItem: (key) => (key === storageKey ? stored : null) }),
      state,
    );
  }
});
