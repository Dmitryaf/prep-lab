import test from "node:test";
import assert from "node:assert/strict";
import { loadCommonKnowledge } from "../server/infrastructure/knowledge/common.ts";
import {
  knowledgeForProfile,
  supportsQuestion,
} from "../domain/knowledge/profile.ts";
import { headings } from "../domain/knowledge/markdown.ts";
import {
  selectInterview,
  dailySession,
} from "../domain/interview/selection.ts";
import { loadState, validateState } from "../domain/interview/saved-state.ts";

const common = loadCommonKnowledge();
test("the complete common base contains no owner materials and retains stable question identities", () => {
  assert.equal(common.notes.length, 218);
  assert.equal(common.questions.length, 574);
  assert.equal(
    new Set(common.questions.map((question) => question.id)).size,
    574,
  );
  assert(
    !/Dmitryaf|МЭДО|Inbox Point|Trajectory|Landocs|Docshouse|cokr/i.test(
      JSON.stringify(common),
    ),
  );
});
for (const profile of ["vue", "react"] as const) {
  test(`${profile}: core routes, answers, criteria and live material links remain usable`, () => {
    const bank = knowledgeForProfile(common, profile);
    assert.equal(bank.route.length, 66);
    assert(bank.questions.length > 400);
    for (const id of bank.route) {
      const question = bank.questions.find((question) => question.id === id)!;
      assert(question?.answer && question.criteria, id);
      assert(supportsQuestion(question, profile), id);
      assert(
        question.learningLinks.some((link) => link.kind === "theory"),
        "No theory: " + id,
      );
      for (const link of question.learningLinks) {
        const note = bank.notes.find((note) => note.id === link.noteId);
        assert(note, "Unavailable core material: " + id + " → " + link.noteId);
        assert(
          !link.heading ||
            headings(note.markdown).some(
              (heading) => heading.title === link.heading,
            ),
          "Missing core anchor: " + id + " → " + link.heading,
        );
      }
    }
    // This checks the actual selected materials, including code/examples, not only category labels.
    const forbidden =
      profile === "react"
        ? /\bVue\b|\bVuex\b|\bPinia\b|\.vue\b|from ['"]vue['"]/
        : /\bReact\b|\bRedux\b|\buseEffect\b|from ['"]react['"]/;
    for (const note of bank.notes) {
      assert(!forbidden.test(note.markdown), note.id);
      const fences = note.markdown.match(/^\s*```/gm) || [];
      assert.equal(fences.length % 2, 0, "Broken code fence: " + note.id);
    }
    for (let day = 0; day < 90; day++) {
      for (const kind of ["daily", "full"] as const) {
        const questions = selectInterview(
          bank.questions,
          kind,
          String(day),
          [],
          {},
          profile,
        );
        assert.equal(questions.length, kind === "daily" ? 11 : 20);
        assert(
          questions.filter(
            (question) =>
              question.category === (profile === "react" ? "React" : "Vue") &&
              question.kind === "theory",
          ).length >= (kind === "daily" ? 2 : 3),
        );
        assert(
          questions.every((question) => supportsQuestion(question, profile)),
        );
        assert(questions.every((question) => question.source !== "projects"));
      }
    }
  });
}
test("changing profile creates a separate daily selection without rebuilding an existing snapshot", () => {
  const blank = loadState({ getItem: () => null });
  const vue = dailySession(
    blank,
    knowledgeForProfile(common, "vue").questions,
    "2026-11-03",
    "vue",
  );
  const original = structuredClone(vue.daily["2026-11-03"]);
  const react = dailySession(
    vue,
    knowledgeForProfile(common, "react").questions,
    "2026-11-03",
    "react",
  );
  assert.deepEqual(react.daily["2026-11-03"], original);
  assert.equal(react.daily["2026-11-03:react"].profile, "react");
  assert.deepEqual(validateState(react), react);
  assert.equal(dailySession(react, [], "2026-11-03", "vue"), react);
});
