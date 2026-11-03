import { required } from "./helpers/values.ts";
import type { Interview } from "../domain/interview/state.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  topics,
  projects as ownerProjects,
  ownerAvailable,
} from "./helpers/owner-package.ts";
import { ownerCatalog } from "../server/infrastructure/projects/owner.ts";
import { ownerPackagePath } from "../server/infrastructure/projects/catalog.ts";
import { loadCommonKnowledge } from "../server/infrastructure/knowledge/common.ts";
import { projectQuestions } from "../app/entities/project/model/questions.ts";
import { loadKnowledge } from "../server/knowledge.ts";
import {
  selectInterview,
  dailySession,
  loadState,
  saveState,
  exportState,
  importState,
  rateQuestion,
} from "../domain/interview/engine.ts";
const knowledge = ownerAvailable
  ? loadKnowledge(resolve(ownerPackagePath(), "knowledge"))
  : loadCommonKnowledge();
const projects = projectQuestions(
    topics,
    ownerProjects,
    ownerCatalog.experience,
  ),
  bank = [...knowledge.questions, ...projects];
const blank = () => loadState({ getItem: () => null });
test(
  "real curriculum keeps Vue, project and experience coverage across 90 days, even with many gaps",
  { skip: !ownerAvailable },
  () => {
    const visited = new Set();
    let history: Pick<Interview, "questionIds">[] = [];
    const progress = Object.fromEntries(
      bank
        .filter((q) => q.category === "JavaScript")
        .map((q) => [q.id, { status: "again" as const }]),
    );
    for (let day = 1; day <= 90; day++) {
      const date = `day-${day}`;
      for (const kind of ["daily", "full"] as const) {
        const q = selectInterview(bank, kind, date, history, progress);
        assert.equal(new Set(q.map((q) => q.id)).size, q.length);
        assert(
          q.length >= (kind === "daily" ? 11 : 20) &&
            q.length <= (kind === "daily" ? 12 : 20),
        );
        assert(
          q.filter((q) => q.kind === "theory" && q.category === "Vue").length >=
            (kind === "daily" ? 2 : 3),
        );
        assert(
          q.filter((q) => q.kind === "theory" && q.category === "TypeScript")
            .length >= 2,
        );
        assert(q.some((q) => q.category === "Браузер, HTML и CSS"));
        assert(q.some((q) => q.category === "Сети и безопасность"));
        assert(
          q.some((q) =>
            [
              "Тестирование",
              "Инженерные вопросы",
              "Архитектура, производительность и тестирование",
            ].includes(q.category),
          ),
        );
        assert(
          q.filter((q) => q.kind === "project").length >=
            (kind === "daily" ? 2 : 5),
        );
        assert(q.some((q) => q.project === "lanit"));
        assert(
          q.every(
            (q) => q.source === "projects" || q.curriculumTier === "core",
          ),
        );
        if (kind === "full") {
          for (const project of ["trajectory", "inbox", "lanit"])
            assert(q.some((q) => q.project === project));
          assert(
            new Set(
              q
                .filter((question) => question.kind === "project")
                .map((question) => question.projectGroup),
            ).size >= 2,
          );
          for (const k of ["practice", "design", "behavioral"])
            assert(q.some((q) => q.kind === k));
        }
        assert.deepEqual(
          selectInterview(bank, kind, date, history, progress),
          q,
        );
        q.forEach((q) => visited.add(q.id));
      }
      history = [
        {
          questionIds: selectInterview(
            bank,
            "daily",
            date,
            history,
            progress,
          ).map((q) => q.id),
        },
        ...history,
      ].slice(0, 3);
    }
    assert(
      visited.size > 80,
      `Only ${visited.size} unique questions across 90 days`,
    );
  },
);
test(
  "project adapters preserve map IDs, use confirmed stories and keep code separate from experience",
  { skip: !ownerAvailable },
  () => {
    assert.equal(projects.length, 177);
    for (const q of projects) {
      assert(
        q.answer &&
          q.criteria &&
          q.followups!.length &&
          q.learningLinks!.length,
      );
      const t = required(topics.find((t) => t.id === q.topicId));
      assert(t.pilot.questions.some((p) => `${t.id}/${p.id}` === q.id));
      if (q.project === "lanit") {
        assert(q.prompt.includes("Учебный код cokr не подтверждает"));
        assert(q.answer.includes(required(t.story).short));
        assert(
          q.learningLinks.some((l) => l.noteId.startsWith("Опыт и проекты/")),
        );
      }
    }
  },
);
test("old sessions stay frozen; new ratings and revealed daily answers survive save, reload and export", () => {
  const oldBank = knowledge.questions;
  let state = dailySession(blank(), oldBank, "2026-10-27");
  const old = structuredClone(state.daily["2026-10-27"]);
  assert.equal(dailySession(state, bank, "2026-10-27"), state);
  state = dailySession(state, bank, "2026-10-28");
  const current = state.daily["2026-10-28"],
    q = current.questionIds[0];
  state = rateQuestion(state, q, "again");
  current.ratings[q] = "again";
  current.reviewed = [q];
  current.index = 1;
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (key: string, value: string) => (raw = value),
  };
  saveState(state, storage);
  assert.deepEqual(loadState(storage), state);
  assert.deepEqual(importState(exportState(state), blank()), state);
  assert.deepEqual(state.daily["2026-10-27"], old);
  assert.equal(dailySession(state, [], "2026-10-28"), state);
  const next = dailySession(state, bank, "2026-10-29");
  assert(next.daily["2026-10-29"].questionIds.includes(q));
  const bad = structuredClone(state);
  bad.daily["2026-10-28"].reviewed = ["unknown"];
  assert.throws(() => importState(JSON.stringify(bad), state));
});
