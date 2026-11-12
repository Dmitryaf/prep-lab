import { test, expect } from "#tests/helpers/browser.ts";
import { expectCompactReview } from "#tests/helpers/interview-review.ts";
import { readProgress } from "#tests/helpers/browser-progress.ts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectFixture } from "#tests/fixtures/projects.ts";

test.use({ appOptions: { projectPackageRoot: null } });

test("a clean instance starts practical rounds, preserves explicit answer reveal and shows the final review", async ({
  app: { base },
  page,
}, testInfo) => {
  await page.goto(base + "/#/interview");
  const format = page.getByRole("group", {
    name: "Формат интервью",
    exact: true,
  });
  await expect(format).toBeVisible();
  for (const value of ["coding", "review", "design"] as const) {
    await format.locator(`input[value="${value}"]`).check();
    await page.locator('[data-action="full"]:enabled').click();
    await expect(page.locator('[data-action="session-next"]')).toBeVisible();
    const progress = await readProgress(page);
    const session = progress.sessions[progress.activeSession!];
    expect(session.format).toBe(value);
    expect(session.questionIds).toHaveLength(
      value === "design" ? 1 : value === "coding" ? 4 : 3,
    );
    expect(
      Object.values(session.snapshots).every((q) => q.roundFormat === value),
    ).toBe(true);
    await page.reload();
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await expect(page.locator(".question-source")).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: "Полезные темы" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Моя попытка", exact: true }),
    ).toHaveCount(0);
    if (value === "coding")
      await page.screenshot({
        path: testInfo.outputPath("coding-desktop.png"),
        fullPage: true,
      });
    if (value !== "coding") {
      const current = session.snapshots[session.questionIds[session.index]];
      const answeredFollowups = (current.followups || []).filter((title) =>
        current.followupAnswers?.some(
          (answer) => answer.title === title && answer.answer.trim(),
        ),
      );
      const followup = page.locator('[data-action="session-followup"]');
      if (answeredFollowups.length) {
        await expect(followup).toBeEnabled();
        await followup.click();
        await expect(page.locator(".followup-question h3")).toHaveText(
          answeredFollowups[0],
        );
        await expect(page.locator(".platform-answer")).toHaveCount(0);
        await page.locator('[data-action="session-previous"]').click();
        await expect(page.locator(".followup-question")).toHaveCount(0);
      } else await expect(followup).toHaveCount(0);
    }
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await page.locator('[data-action="session-review"]').click();
    await expect(page.locator(".platform-answer")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".platform-answer")).toHaveCount(1);
    for (const _id of session.questionIds) {
      await page.locator('[data-action="session-next"]').click();
    }
    await expect(
      page.getByRole("heading", { name: "Разбор интервью" }),
    ).toBeVisible();
    await expectCompactReview(page, session);
    await page.getByRole("link", { name: "← Все интервью" }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(format).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("rounds-mobile.png"),
    fullPage: true,
  });
  await format
    .getByRole("radio", { name: "Смешанное интервью", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    format.getByRole("radio", { name: "Написание кода", exact: true }),
  ).toBeChecked();
  await format.getByRole("radio", { name: "Ревью кода", exact: true }).check();
  await page.locator('[data-action="full"]:enabled').click();
  await expect(
    page.getByRole("textbox", { name: "Моя попытка", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("review-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

const legacyTest = test.extend<{ legacyPackage: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature.
  legacyPackage: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "frontend-rounds-legacy-"));
    try {
      const folder = join(directory, "knowledge/Собеседования/Темы");
      await mkdir(folder, { recursive: true });
      await writeFile(
        join(directory, "projects.json"),
        JSON.stringify(projectFixture()),
      );
      await writeFile(
        join(folder, "JavaScript.md"),
        "# JavaScript\n\n## Личный вопрос\nОбъясните замыкание.\n\n> [!answer]- Ответ\n> Функция сохраняет доступ к лексическому окружению.\n\n**Критерии ответа:** Объяснение окружения.",
      );
      await use(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  appOptions: async ({ legacyPackage }, use) => {
    await use({ projectPackageRoot: legacyPackage, knowledgeRoot: "" });
  },
});

legacyTest(
  "all four formats start with a legacy personal package in both profiles and persist their review",
  async ({ app: { base }, page }) => {
    await page.goto(base + "/#/interview");
    for (const profile of ["vue", "react"]) {
      await page.locator("#preparationProfile").selectOption(profile);
      for (const format of ["mixed", "coding", "review", "design"]) {
        await page
          .locator(`input[name="interview-format"][value="${format}"]`)
          .check();
        await page.locator('[data-action="full"]:enabled').click();
        await expect(
          page.locator('[data-action="session-next"]'),
        ).toBeVisible();
        const progress = await readProgress(page);
        const session = progress.sessions[progress.activeSession!];
        expect(session.profile).toBe(profile);
        expect(session.format || "mixed").toBe(format);
        expect(session.questionIds.length).toBeGreaterThan(0);
        if (format !== "mixed") {
          expect(session.questionIds).toHaveLength(
            format === "design" ? 1 : format === "coding" ? 4 : 3,
          );
          expect(
            Object.values(session.snapshots).every(
              (q) => q.roundFormat === format,
            ),
          ).toBe(true);
        }
        await page.reload();
        await expect(
          page.locator('[data-action="session-next"]'),
        ).toBeVisible();
        await expect(page.locator(".platform-answer")).toHaveCount(0);
        const finish = page.locator('[data-action="session-finish"]');
        if (session.questionIds.length > 1) await finish.click();
        else await page.locator('[data-action="session-next"]').click();
        await expect(
          page.getByRole("heading", { name: "Разбор интервью" }),
        ).toBeVisible();
        await page.reload();
        await expectCompactReview(page, session);
        await page.getByRole("link", { name: "← Все интервью" }).click();
      }
    }
  },
);
