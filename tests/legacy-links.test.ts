import test from "node:test";
import assert from "node:assert/strict";
import { legacyLocation } from "#ui/shared/lib/navigation.ts";

test("legacy links work before and after hash-history slash normalization", () => {
  const query = new URLSearchParams({
    view: "practice",
    question: "Вопросы/JavaScript::Event Loop",
  }).toString();
  for (const hash of ["#" + query, "#/" + query])
    assert.deepEqual(legacyLocation("", hash), {
      path: "/practice",
      query: { question: "Вопросы/JavaScript::Event Loop" },
    });
  for (const hash of ["#topic=example", "#/topic=example"])
    assert.deepEqual(legacyLocation("", hash), {
      path: "/projects",
      query: { projectTopic: "example" },
    });
  assert.equal(legacyLocation("", "#/practice?question=example"), undefined);
});
