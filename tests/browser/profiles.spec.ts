import { test, expect } from "#tests/helpers/browser.ts";
import { readProgress } from "#tests/helpers/browser-progress.ts";
import { expectCompactReview } from "#tests/helpers/interview-review.ts";
import { supportsQuestion } from "#domain/knowledge/profile.ts";
import { mkdir } from "node:fs/promises";

test.use({ appOptions: { projectPackageRoot: null } });
test("a clean instance prepares both profiles, preserves separate daily snapshots and works without projects", async ({
  app: { base },
  page,
}) => {
  await page.goto(base + "/#/projects");
  await expect(
    page.getByRole("heading", { name: "Добавьте свой проект" }),
  ).toBeVisible();
  await page.locator("#preparationProfile").selectOption("react");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await page.locator('#platformNav a[href="#/interview"]').click();
  await page.locator('[data-action="daily"]:enabled').click();
  await expect(page.locator(".question-card h2")).toBeVisible();
  const first = await readProgress(page);
  const react = Object.values(first.daily).find(
    (session) => session.profile === "react",
  )!;
  expect(react.questionIds).toHaveLength(11);
  expect(
    Object.values(react.snapshots).every(
      (question) =>
        supportsQuestion(question, "react") && question.source !== "projects",
    ),
  ).toBe(true);
  await page.locator("[data-action=session-review]").click();
  await page.locator("[data-rating=again]").click();
  const preserved = (await readProgress(page)).daily[react.date + ":react"];
  await page.locator('#platformNav a[href="#/interview"]').click();
  await page.locator("#preparationProfile").selectOption("vue");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await page.locator('[data-action="daily"]:enabled').click();
  await expect(page.locator(".question-card h2")).toBeVisible();
  const both = await readProgress(page);
  expect(both.daily[react.date + ":react"]).toEqual(preserved);
  expect(both.daily[react.date].profile).toBe("vue");
  expect(
    Object.values(both.daily[react.date].snapshots).every((question) =>
      supportsQuestion(question, "vue"),
    ),
  ).toBe(true);
  await page.locator('#platformNav a[href="#/interview"]').click();
  await page.locator("[data-action=full]:enabled").click();
  await expect(page.locator("[data-action=session-next]")).toBeVisible();
  for (let index = 0; index < 20; index++) {
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await page.locator("[data-action=session-next]").click();
  }
  const completed = await readProgress(page);
  await expectCompactReview(page, completed.sessions[completed.activeSession!]);
  await page.reload();
  await expect(page.locator("#preparationProfile")).toHaveValue("vue");
  expect((await readProgress(page)).daily[react.date + ":react"]).toEqual(
    preserved,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await page.locator('#platformNav a[href="#/projects"]').click();
  await expect(
    page.getByRole("heading", { name: "Добавьте свой проект" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await mkdir("artifacts/profiles", { recursive: true });
  await page.screenshot({
    path: "artifacts/profiles/clean-mobile.png",
    fullPage: true,
  });
});
