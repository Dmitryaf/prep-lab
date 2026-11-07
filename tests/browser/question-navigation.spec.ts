import { test as baseTest, expect } from "#tests/helpers/browser.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession } from "#domain/interview/selection.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "#tests/helpers/browser-progress.ts";

const test = baseTest.extend<{ projectDirectory: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture dependencies.
  projectDirectory: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "question-navigation-"));
    try {
      await writeFile(
        join(directory, "projects.json"),
        JSON.stringify(projectFixture()),
      );
      await use(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  appOptions: async ({ projectDirectory }, use) => {
    await use({
      projectPackageRoot: projectDirectory,
      knowledgeRoot: join(process.cwd(), "content/common"),
    });
  },
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });
    test.afterEach(async ({ page }, info) => {
      await page.screenshot({
        path: info.outputPath("question-navigation.png"),
        fullPage: true,
      });
    });
    test("practice returns to the previous question, including after a random choice and a direct link", async ({
      app: { base },
      page,
    }) => {
      await page.goto(base + "/#/practice?category=projects");
      const title = page.locator(".question-card h2");
      const first = await title.innerText();
      const previous = page.locator('[data-action="previous-question"]');
      await expect(previous).toBeDisabled();
      await expect(
        page.getByRole("textbox", { name: "Моя попытка", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("textbox", { name: "Ссылка на решение", exact: true }),
      ).toHaveCount(0);
      await page.locator('[data-action="next-question"]').click();
      const second = await title.innerText();
      expect(second).not.toBe(first);
      await previous.click();
      await expect(title).toHaveText(first);
      await page.locator('[data-action="random-question"]').click();
      // Different projects can have identically named questions.
      await expect(
        page.locator("#platformMain .platform-meta").first(),
      ).not.toHaveText("1 из 18");
      await previous.click();
      await expect(title).toHaveText(first);
      await page.goto(
        base + "/#/practice?question=" + encodeURIComponent("first-main/q1"),
      );
      await expect(title).toHaveText(second);
      await previous.click();
      await expect(title).toHaveText(first);
    });

    test("project review has previous-question navigation", async ({
      app: { base },
      page,
    }) => {
      await page.goto(base + "/#/projects?project=first&mode=review");
      const title = page.locator(".question-card h2");
      const first = await title.innerText();
      const previous = page.locator('[data-action="previous-question"]');
      await expect(previous).toBeDisabled();
      await page.locator('[data-action="next-question"]').click();
      await expect(title).not.toHaveText(first);
      await previous.click();
      await expect(title).toHaveText(first);
    });

    test("interview question changes preserve a visible question position instead of focusing the page top", async ({
      app: { base },
      page,
    }) => {
      await page.goto(base + "/#/interview");
      await expect(page.locator('[data-action="full"]')).toBeEnabled();
      const question = (id: string) => ({
        id,
        title: "Вопрос " + id,
        prompt:
          "Условие\n\n" + "Абзац условия.\n\n".repeat(id === "first" ? 30 : 1),
        answer: "Ответ",
        criteria: "Проверка",
        kind: "theory" as const,
        source: "knowledge" as const,
        category: "JavaScript",
        availableAnswer: true,
        followups: [],
        learningLinks: [],
      });
      const session = createSession(
        [question("first"), question("second")],
        "full",
        {},
      );
      session.questionIds = ["first", "second"];
      const state = await readProgress(page);
      state.sessions[session.id] = session;
      await restoreProgressFixture(page, state);
      await page.goto(
        base + "/#/interview?session=" + encodeURIComponent(session.id),
      );
      await expect(page.locator(".question-card h2")).toHaveText(
        "Вопрос first",
      );
      await page.evaluate(() => window.scrollTo(0, 120));
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(50);
      // Keyboard activation does not scroll the button into view like a pointer helper would.
      await page
        .locator('[data-action="session-next"]')
        .evaluate((button: HTMLButtonElement) =>
          button.focus({ preventScroll: true }),
        );
      await page.keyboard.press("Enter");
      await expect(page.locator(".question-card h2")).toHaveText(
        "Вопрос second",
      );
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
      await page.locator('[data-action="session-previous"]').click();
      await expect(page.locator(".question-card h2")).toHaveText(
        "Вопрос first",
      );
      await page
        .locator(".question-workspace")
        .evaluate((el) =>
          window.scrollTo(
            0,
            window.scrollY + el.getBoundingClientRect().top + 600,
          ),
        );
      await page
        .locator('[data-action="session-next"]')
        .evaluate((button: HTMLButtonElement) =>
          button.focus({ preventScroll: true }),
        );
      await page.keyboard.press("Enter");
      await expect(page.locator(".question-card h2")).toHaveText(
        "Вопрос second",
      );
      const top = () =>
        page
          .locator(".question-workspace")
          .evaluate((el) => el.getBoundingClientRect().top);
      await expect.poll(top).toBeGreaterThanOrEqual(15);
      await expect.poll(top).toBeLessThanOrEqual(17);
    });

    test("practice keeps its position after hiding a long answer", async ({
      app: { base },
      page,
    }) => {
      const questions = ["first", "second"].map((id) => ({
        id,
        title: "Вопрос " + id,
        prompt: "Короткое условие",
        answer: "Подробный разбор.\n\n".repeat(40),
        criteria: "Критерий",
        kind: "theory",
        source: "knowledge",
        category: "JavaScript",
        availableAnswer: true,
        followups: [],
        learningLinks: [],
      }));
      await page.route("**/api/knowledge", (route) =>
        route.fulfill({
          json: {
            notes: [],
            questions,
            route: questions.map((q) => q.id),
            warnings: [],
          },
        }),
      );
      await page.goto(base + "/#/practice");
      await expect(page.locator(".question-card h2")).toHaveText(
        "Вопрос first",
      );
      await page.locator('[data-action="reveal"]').click();
      await expect(page.locator(".platform-answer")).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 100));
      await page
        .locator('[data-action="next-question"]')
        .evaluate((button: HTMLButtonElement) =>
          button.focus({ preventScroll: true }),
        );
      await page.keyboard.press("Enter");
      await expect(page.locator(".question-card h2")).toHaveText(
        "Вопрос second",
      );
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(100);
      await expect(page.locator(".platform-answer")).toHaveCount(0);
      await page.locator('[data-action="previous-question"]').click();
      await page.locator('[data-action="reveal"]').click();
      await page
        .locator(".question-workspace")
        .evaluate((el) =>
          window.scrollTo(
            0,
            window.scrollY + el.getBoundingClientRect().top + 600,
          ),
        );
      await page
        .locator('[data-action="next-question"]')
        .evaluate((button: HTMLButtonElement) =>
          button.focus({ preventScroll: true }),
        );
      await page.keyboard.press("Enter");
      await expect(page.locator(".question-card h2")).toHaveText(
        "Вопрос second",
      );
      await expect
        .poll(() =>
          page
            .locator(".question-workspace")
            .evaluate((el) => el.getBoundingClientRect().top),
        )
        .toBeCloseTo(16, 0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  });
}
