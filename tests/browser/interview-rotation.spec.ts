import { resolve } from "node:path";
import { test, expect } from "#tests/helpers/browser.ts";
import {
  restoreProgressFixture,
  readProgress,
} from "#tests/helpers/browser-progress.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { dailySession } from "#domain/interview/selection.ts";
import { loadState } from "#domain/interview/saved-state.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

test("yesterday's unanswered questions stay in Repeat while daily chooses new questions", async ({
  app: { base },
  page,
}) => {
  const bank = loadCommonKnowledge();
  const state = dailySession(
    loadState({ getItem: () => null }),
    bank.questions,
    "2026-11-09",
  );
  const yesterday = state.daily["2026-11-09"]!;
  yesterday.finished = true;
  for (const id of yesterday.questionIds)
    state.questionProgress[id] = { status: "again" };
  await page.clock.install({ time: new Date("2026-11-10T10:00:00+05:00") });
  await page.goto(base);
  await restoreProgressFixture(page, state);
  const before = await readProgress(page);
  await page.locator('[data-action="daily"]').click();
  await expect(page.locator(".question-card h2")).toBeVisible();
  const next = await readProgress(page);
  const today = next.daily["2026-11-10"]!;
  expect(today.questionIds).toHaveLength(11);
  expect(
    today.questionIds.filter((id) => yesterday.questionIds.includes(id)),
  ).toEqual([]);
  expect(next.questionProgress).toEqual(before.questionProgress);
  expect(next.daily["2026-11-09"]).toEqual(before.daily["2026-11-09"]);
  await page.goto(base + "/#/repeat");
  await expect(
    page.getByRole("heading", { name: "Повторить", exact: true }),
  ).toBeVisible();
  for (const id of yesterday.questionIds)
    await expect(
      page
        .locator(".platform-list-row")
        .getByText(bank.questions.find((q) => q.id === id)!.title, {
          exact: true,
        }),
    ).toBeVisible();
});

test("rewritten engineering question opens by its old ID and old material link", async ({
  app: { base },
  page,
}) => {
  const bank = loadCommonKnowledge();
  const note = "Собеседования/Темы/Выпуск изменений и эксплуатация";
  const heading = "Как расследовать инцидент в рабочем окружении?";
  const id = `ck:${note}#${heading}`;
  const q = bank.questions.find((q) => q.id === id)!;
  await page.goto(
    base + "/#/practice?" + new URLSearchParams({ question: id }),
  );
  await expect(page.locator(".question-card h2")).toHaveText(q.title);
  await page.goto(base + "/#/themes?" + new URLSearchParams({ note, heading }));
  await expect(page.locator(".platform-note")).toBeVisible();
  await expect(page.locator(".platform-note")).not.toContainText("ID вопроса");
  await expect(
    page
      .locator(".platform-note")
      .getByRole("heading", { name: q.title, exact: true }),
  ).toBeVisible();
});
