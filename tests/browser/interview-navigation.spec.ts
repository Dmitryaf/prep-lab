import { required } from "#tests/helpers/values.ts";
import type { Progress, Interview } from "#domain/interview/state.ts";
import { readProgress } from "#tests/helpers/browser-progress.ts";
import { test, expect } from "#tests/helpers/browser.ts";
import { mkdir } from "node:fs/promises";

test("interview navigation", async ({
  app: { base },
  page,
  pageErrors: errors,
}) => {
  const state = () => readProgress(page);
  const daily = (s: Progress) => s.daily["2026-11-03"];
  await mkdir("artifacts/interview-navigation", { recursive: true });

  await page.clock.install({ time: new Date("2026-11-03T12:00:00+05:00") });
  await page.goto(base);
  await page.locator("[data-action=daily]:enabled").click();
  await page.locator("[data-action=session-next]").waitFor();
  const previous = page.locator("[data-action=session-previous]");
  await expect(
    previous,
    "interview has a previous-question action",
  ).toHaveCount(1);
  await expect(previous).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Скачать прогресс", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Восстановить", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#platformImport")).toHaveCount(0);
  expect(
    !(await page.locator("#platformMain").innerText()).includes(
      "Уточнения необязательны",
    ),
  ).toBeTruthy();
  await expect(page.locator(".platform-footer")).toHaveCount(0);
  const first = daily(await state()),
    id = first.questionIds[0],
    title = first.snapshots[id].title;
  await page.locator("[data-action=session-review]").click();
  await page.locator("[data-rating=partial]").click();
  if (first.snapshots[id].followups?.length) {
    await page.locator("[data-action=session-followup]").click();
    await expect(previous).toHaveText("К основному вопросу");
    const choices = daily(await state()).followupChoices;
    await previous.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".question-card h2")).toHaveText(title);
    expect(daily(await state()).followupIndex).toBe(0);
    expect(daily(await state()).followupChoices).toEqual(choices);
    await expect(page.locator("[data-action=session-followup]")).toHaveCount(0);
  }
  await page.locator("[data-action=session-next]").click();
  const secondId = first.questionIds[1];
  await page.locator("[data-action=session-review]").click();
  await page.locator("[data-rating=again]").click();
  await page.locator("[data-action=session-skip]").click();
  expect(daily(await state()).index).toBe(2);
  const before = daily(await state());
  await previous.click();
  await page.reload();
  await previous.waitFor();
  expect(daily(await state()).index).toBe(1);
  await expect(page.locator(".question-card h2")).toHaveText(
    first.snapshots[secondId].title,
  );
  await previous.click();
  await expect(page.locator(".question-card h2")).toHaveText(title);
  await expect(page.locator(".platform-answer")).toHaveCount(1);
  await expect(previous).toBeDisabled();
  await page.locator("[data-action=session-next]").click();
  const after = daily(await state());
  for (const key of [
    "snapshots",
    "questionIds",
    "ratings",
    "reviewed",
    "skipped",
    "followupChoices",
  ])
    expect(after[key as keyof Interview], key).toEqual(
      before[key as keyof Interview],
    );
  await page.screenshot({
    path: "artifacts/interview-navigation/daily-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/interview-navigation/daily-mobile.png",
    fullPage: true,
  });
  await page.goto(base);
  await page.locator("[data-action=full]:enabled").click();
  await page.locator("[data-action=session-next]").waitFor();
  await expect(previous).toBeDisabled();
  await page.locator("[data-action=session-next]").click();
  await previous.click();
  expect(Object.values((await state()).sessions).at(-1)!.index).toBe(0);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  if (await page.locator("[data-action=session-followup]").count()) {
    await page.locator("[data-action=session-followup]").click();
    await previous.click();
    expect(Object.values((await state()).sessions).at(-1)!.index).toBe(0);
    await expect(page.locator(".platform-answer")).toHaveCount(0);
  }
  await page.reload();
  await page.locator("[data-action=session-next]").waitFor();
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  const full = required(Object.values((await state()).sessions).at(-1));
  for (let i = 0; i < full.questionIds.length; i++)
    await page.locator("[data-action=session-next]").click();
  await page
    .getByRole("heading", { name: "Разбор интервью", exact: true })
    .waitFor();
  await expect(page.locator(".platform-answer")).toHaveCount(
    full.questionIds.length,
  );
  expect(errors).toEqual([]);
  console.log(
    "PASS previous main/followup, first disabled, preserved ratings/review/skips/choices, reload, daily/full reveal rules, clean shell, keyboard and desktop/mobile",
  );
});
