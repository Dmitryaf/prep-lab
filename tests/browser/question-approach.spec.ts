import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { test, expect } from "#tests/helpers/browser.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { createSession, loadState } from "#domain/interview/engine.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "#tests/helpers/browser-progress.ts";
import type { Question } from "#domain/knowledge/question.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

test("guide adapts to a historical followup without rewriting progress or snapshots", async ({
  app: { base },
  page,
  pageErrors,
}) => {
  const root: Question = {
    id: "historical-approach",
    title: "Реализуйте поиск",
    prompt: "Историческое условие поиска",
    kind: "practice",
    roundFormat: "coding",
    source: "knowledge",
    category: "JavaScript",
    answer: "Исторический основной ответ",
    followups: ["Почему поздний ответ нельзя применять?"],
    followupAnswers: [
      {
        title: "Почему поздний ответ нельзя применять?",
        answer: "Исторический ответ уточнения",
      },
    ],
  };
  const session = createSession([root], "full");
  const state = loadState({ getItem: () => null });
  state.sessions[session.id] = session;
  await page.goto(base);
  await restoreProgressFixture(page, state);
  await page.goto(
    `${base}/?approach-history=1#/interview?session=${encodeURIComponent(session.id)}`,
  );
  const guide = page.locator(".question-approach");
  await expect(guide).toHaveAttribute("data-approach", "coding");
  const before = await readProgress(page);
  await guide.locator("summary").click();
  await expect(guide.locator("details")).toHaveAttribute("open", "");
  expect(await readProgress(page)).toEqual(before);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page.locator('[data-action="session-followup"]').click();
  await expect(guide).toHaveCount(1);
  await expect(guide).toHaveAttribute("data-approach", "theory");
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  const followupState = await readProgress(page);
  await guide.locator("summary").click();
  expect(await readProgress(page)).toEqual(followupState);
  await page.locator('[data-action="followup-review"]').click();
  await expect(page.locator(".platform-answer")).toContainText(
    "Исторический ответ уточнения",
  );
  await page.reload();
  await expect(guide).toHaveAttribute("data-approach", "theory");
  expect(
    (await readProgress(page)).sessions[session.id].snapshots[root.id],
  ).toEqual(root);
  expect(pageErrors).toEqual([]);
});

test("approach stays visible without revealing answers and fits mobile", async ({
  app: { base },
  page,
}) => {
  const bank = loadCommonKnowledge();
  const diagnosis = bank.questions.find(
    (q) =>
      q.title === "Ошибка у части пользователей не воспроизводится локально",
  )!;
  const theory = bank.questions.find(
    (q) => q.title === "Почему деструктуризация может потерять реактивность?",
  )!;
  for (const [q, kind] of [
    [diagnosis, "diagnosis"],
    [theory, "theory"],
  ] as const) {
    await page.goto(`${base}/#/practice?question=${encodeURIComponent(q.id)}`);
    const guide = page.locator(".question-approach");
    await expect(guide).toHaveAttribute("data-approach", kind);
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await guide.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(guide.locator("details")).toHaveAttribute("open", "");
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await page.locator("[data-action=reveal]").click();
    await expect(page.locator(".platform-answer")).toBeVisible();
    await expect(guide).toBeVisible();
  }
  await mkdir("artifacts/question-approach", { recursive: true });
  await page.screenshot({
    path: "artifacts/question-approach/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${base}/#/practice?question=${encodeURIComponent(diagnosis.id)}`,
  );
  await expect(page.locator(".question-approach")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/question-approach/mobile.png",
    fullPage: true,
  });
});
