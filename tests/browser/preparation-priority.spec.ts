import { resolve } from "node:path";
import { test, expect } from "#tests/helpers/browser.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { knowledgeForProfile } from "#domain/knowledge/profile.ts";
import { createSession, loadState } from "#domain/interview/engine.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "#tests/helpers/browser-progress.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

const bank = loadCommonKnowledge();
const current = bank.questions.find(
  (q) => q.title === "От чего зависит this?",
)!;
const deepTitle =
  "Как ведёт себя связанная через bind функция при вызове с new?";
const deepAnswer = current.followupAnswers!.find(
  (item) => item.title === deepTitle,
)!;

test("new mixed interview opens only a curated basic this followup", async ({
  app: { base },
  page,
  pageErrors,
}) => {
  const session = createSession([current], "full");
  const snapshot = session.snapshots[current.id]!;
  expect(snapshot.followups).not.toContain(deepTitle);
  expect(snapshot.followups).toEqual(current.interviewFollowups);
  const state = loadState({ getItem: () => null });
  state.sessions[session.id] = session;
  await page.goto(base);
  await restoreProgressFixture(page, state);
  await page.goto(
    `${base}/#/interview?session=${encodeURIComponent(session.id)}`,
  );
  await expect(page.locator(".question-card h2")).toHaveText(current.title);
  await page.locator('[data-action="session-followup"]').click();
  const title = await page.locator(".followup-question h3").innerText();
  expect(current.interviewFollowups).toContain(title);
  expect(title).not.toBe(deepTitle);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page.locator('[data-action="followup-review"]').click();
  const answer = current.followupAnswers!.find((item) => item.title === title)!;
  await expect(page.locator(".platform-answer")).toContainText(
    answer.answer.split("\n")[0]!,
  );
  expect(
    (await readProgress(page)).sessions[session.id]!.snapshots[current.id],
  ).toEqual(snapshot);
  expect(pageErrors).toEqual([]);
});

test("the complete practice card retains the ready deep this explanation", async ({
  app: { base },
  page,
  pageErrors,
}) => {
  await page.goto(
    `${base}/#/practice?question=${encodeURIComponent(current.id)}`,
  );
  await expect(page.locator(".question-card h2")).toHaveText(current.title);
  await page.locator('[data-action="reveal"]').click();
  const details = page.locator(".answer-followups");
  await page.getByRole("tab", { name: /^Уточнения/ }).click();
  await expect(details).toContainText(deepTitle);
  await expect(details).toContainText(deepAnswer.answer.split("\n")[0]!);
  await expect(
    details.locator("pre").filter({ hasText: "new BoundUser()" }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("an old snapshot still opens its deep stage without rewriting its position", async ({
  app: { base },
  page,
  pageErrors,
}) => {
  const historicalQuestion = structuredClone(current);
  delete historicalQuestion.interviewFollowups;
  const deepIndex = historicalQuestion.followups.indexOf(deepTitle) + 1;
  expect(deepIndex).toBeGreaterThan(0);
  const session = {
    ...createSession([current], "full"),
    snapshots: { [current.id]: historicalQuestion },
    followupIndex: deepIndex,
  };
  const state = loadState({ getItem: () => null });
  state.sessions[session.id] = session;
  await page.goto(base);
  await restoreProgressFixture(page, state);
  await page.goto(
    `${base}/#/interview?session=${encodeURIComponent(session.id)}`,
  );
  await expect(page.locator(".followup-question h3")).toHaveText(deepTitle);
  await page.locator('[data-action="followup-review"]').click();
  await expect(page.locator(".platform-answer")).toContainText(
    deepAnswer.answer.split("\n")[0]!,
  );
  await page.reload();
  await expect(page.locator(".followup-question h3")).toHaveText(deepTitle);
  const stored = (await readProgress(page)).sessions[session.id]!;
  expect(stored.followupIndex).toBe(deepIndex);
  expect(stored.snapshots[current.id]).toEqual(historicalQuestion);
  expect(pageErrors).toEqual([]);
});

test("a diagnostic chosen by a real full session exposes its condition and answer", async ({
  app: { base },
  page,
  pageErrors,
}) => {
  const profile = knowledgeForProfile(bank, "vue");
  const session = createSession(profile.questions, "full", {}, "vue");
  expect(session.questionIds).toHaveLength(20);
  const diagnosticIds = session.questionIds.filter(
    (id) => session.snapshots[id]!.interviewDiagnostic,
  );
  expect(diagnosticIds).toHaveLength(1);
  const diagnostic = session.snapshots[diagnosticIds[0]!]!;
  session.index = session.questionIds.indexOf(diagnostic.id);
  const state = loadState({ getItem: () => null });
  state.sessions[session.id] = session;
  await page.goto(base);
  await restoreProgressFixture(page, state);
  await page.goto(
    `${base}/#/interview?session=${encodeURIComponent(session.id)}`,
  );
  await expect(page.locator(".question-card h2")).toHaveText(diagnostic.title);
  const condition = diagnostic.prompt.startsWith(diagnostic.title + "\n\n")
    ? diagnostic.prompt.slice(diagnostic.title.length + 2)
    : diagnostic.prompt;
  await expect(page.locator(".question-card")).toContainText(condition);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page.locator('[data-action="session-review"]').click();
  await expect(page.locator(".platform-answer")).toContainText(
    (diagnostic.shortAnswer || diagnostic.answer).split("\n")[0]!,
  );
  expect(
    (await readProgress(page)).sessions[session.id]!.snapshots[diagnostic.id],
  ).toEqual(diagnostic);
  expect(pageErrors).toEqual([]);
});
