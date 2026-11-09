import test from "node:test";
import assert from "node:assert/strict";
import { dailySession, selectInterview } from "#domain/interview/selection.ts";
import { loadState } from "#domain/interview/saved-state.ts";
import type { Question } from "#domain/knowledge/question.ts";

const bank: Question[] = Array.from({ length: 55 }, (_, i) => ({
  id: `q${i}`,
  title: `Вопрос ${i}`,
  prompt: `Вопрос ${i}`,
  answer: "Ответ",
  criteria: "Критерий",
  kind: "theory",
  source: "knowledge",
  category: "JavaScript",
}));
const ids = (questions: Question[]) => questions.map((q) => q.id);

test("ratings never affect daily or full interview selection", () => {
  for (const kind of ["daily", "full"] as const) {
    const history = [{ questionIds: ids(bank.slice(0, 11)) }];
    const marks = Object.fromEntries(
      bank
        .slice(0, 11)
        .map((q, i) => [
          q.id,
          { status: i % 2 ? ("partial" as const) : ("again" as const) },
        ]),
    );
    const chosen = selectInterview(bank, kind, "2026-11-10", history, marks);
    assert.deepEqual(
      ids(chosen),
      ids(selectInterview(bank, kind, "2026-11-10", history)),
    );
    assert(chosen.every((q) => !marks[q.id]));
  }
});

test("daily uses all previous rounds before reusing a question", () => {
  let state = loadState({ getItem: () => null });
  const visited = new Set<string>();
  for (let day = 1; day <= 5; day++) {
    const date = `2026-11-0${day}`;
    state = dailySession(state, bank, date);
    const questions = state.daily[date]!.questionIds;
    assert.equal(questions.length, 11);
    for (const id of questions) {
      assert(!visited.has(id), `Repeated ${id} before exhausting the bank`);
      visited.add(id);
    }
  }
  const first = new Set(state.daily["2026-11-01"]!.questionIds);
  state = dailySession(state, bank, "2026-11-06");
  assert(state.daily["2026-11-06"]!.questionIds.every((id) => first.has(id)));
});

test("rotation selects unseen and then least recently seen design tasks", () => {
  const tasks = bank
    .slice(0, 4)
    .map((q) => ({ ...q, kind: "design", roundFormat: "design" as const }));
  const history = [0, 1, 2].map((i) => ({ questionIds: [tasks[i]!.id] }));
  assert.deepEqual(
    ids(selectInterview(tasks, "full", "seed", history, {}, "vue", "design")),
    ["q3"],
  );
  for (let seed = 0; seed < 20; seed++)
    assert.deepEqual(
      ids(
        selectInterview(
          tasks.slice(0, 3),
          "full",
          `seed${seed}`,
          history,
          {},
          "vue",
          "design",
        ),
      ),
      ["q2"],
    );
});

test("existing daily snapshots and repeat marks remain unchanged", () => {
  const state = dailySession(
    loadState({ getItem: () => null }),
    bank,
    "2026-11-09",
  );
  const id = state.daily["2026-11-09"]!.questionIds[0]!;
  state.questionProgress[id] = { status: "again" };
  const before = structuredClone(state);
  assert.equal(dailySession(state, bank.slice(11), "2026-11-09"), state);
  const next = dailySession(state, bank, "2026-11-10");
  assert.deepEqual(next.daily["2026-11-09"], before.daily["2026-11-09"]);
  assert.deepEqual(next.questionProgress, before.questionProgress);
  assert(
    next.daily["2026-11-10"]!.questionIds.every(
      (q) => !before.daily["2026-11-09"]!.questionIds.includes(q),
    ),
  );
});
