import assert from "node:assert/strict";
import test from "node:test";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { followupQuestion } from "#domain/knowledge/followup.ts";

test("every published followup has its own available explanation", () => {
  const knowledge = loadCommonKnowledge();
  const missing: string[] = [];
  for (const question of knowledge.questions) {
    for (let index = 0; index < question.followups.length; index++) {
      const followup = followupQuestion(question, index + 1);
      if (!followup?.availableAnswer)
        missing.push(`${question.id}: ${question.followups[index]}`);
    }
  }
  assert.equal(
    missing.length,
    0,
    `${missing.length} unfinished followups; first entries:\n${missing.slice(0, 5).join("\n")}`,
  );
});
