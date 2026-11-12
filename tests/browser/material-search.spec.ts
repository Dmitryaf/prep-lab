import { test, expect } from "#tests/helpers/browser.ts";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

test("search matches titles only, ignoring content, categories and project names", async ({
  app: { base },
  page,
}) => {
  const common = loadCommonKnowledge();
  const catalog = projectFixture();
  catalog.topics[0]!.title = "Фокус проектной темы";
  catalog.topics[1]!.summary = "Контекстописания";
  catalog.projects.first!.name = "Контекстпроекта";
  await page.route("**/api/projects", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route("**/api/knowledge", (route) =>
    route.fulfill({
      json: {
        questions: [
          {
            ...common.questions[0]!,
            title: "Как работает фокус?",
            category: "Контексткатегории",
            prompt: "Контекствопроса",
            profiles: ["vue", "react"],
          },
        ],
        notes: [
          {
            id: "test-focus",
            path: "test-focus.md",
            category: "Браузер",
            title: "Управление фокусом",
            markdown:
              "Контекстматериала: достаточно подробное объяснение поведения браузера и элементов интерфейса.",
            profiles: ["vue", "react"],
          },
        ],
        route: [],
        warnings: [],
      },
    }),
  );
  await page.goto(`${base}/#/themes`);
  await page.getByRole("button", { name: "Найти материал" }).click();
  const dialog = page.getByRole("dialog", { name: "Поиск материалов" });
  const input = dialog.getByRole("searchbox");
  await input.fill("  ФоКуС  ");
  await expect(dialog.locator(".platform-list-row")).toHaveCount(3);
  for (const title of [
    "Как работает фокус?",
    "Управление фокусом",
    "Фокус проектной темы",
  ])
    await expect(
      dialog.getByRole("link", { name: new RegExp(title.replace("?", "\\?")) }),
    ).toBeVisible();
  for (const term of [
    "Контекстматериала",
    "Контекствопроса",
    "Контексткатегории",
    "Контекстописания",
    "Контекстпроекта",
  ]) {
    await input.fill(term);
    await expect(dialog.locator(".platform-list-row")).toHaveCount(0);
    await expect(
      dialog.getByText("Совпадений нет", { exact: false }),
    ).toBeVisible();
  }
});

test("search focus outline stays clear of the close button on desktop and mobile", async ({
  app: { base },
  page,
}) => {
  await page.goto(`${base}/#/themes`);
  await page.getByRole("button", { name: "Найти материал" }).click();
  const dialog = page.getByRole("dialog", { name: "Поиск материалов" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const input = dialog.getByRole("searchbox");
    await input.fill("фокус");
    const ringTop = await input.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        element.getBoundingClientRect().top -
        parseFloat(style.outlineWidth) -
        parseFloat(style.outlineOffset)
      );
    });
    const close = await dialog
      .getByRole("button", { name: "Закрыть поиск" })
      .boundingBox();
    expect(ringTop).toBeGreaterThan(close!.y + close!.height);
    await mkdir("artifacts/material-search", { recursive: true });
    await page.screenshot({
      path: `artifacts/material-search/title-search-${width}.png`,
    });
  }
});

test("search opens separately and returns to the same page", async ({
  app: { base },
  page,
}) => {
  await page.goto(`${base}/#/themes`);
  await expect(page.locator("#platformMain h1")).toBeVisible();
  const heading = await page.locator("#platformMain h1").textContent();
  const trigger = page.getByRole("button", { name: "Найти материал" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Поиск материалов" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("searchbox");
  await expect(input).toBeFocused();
  await input.fill("IndexedDB");
  await expect(dialog.locator(".platform-list-row").first()).toBeVisible();
  await expect(page.locator("#platformMain h1")).toHaveText(heading!);
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Закрыть поиск" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator("#platformMain h1")).toHaveText(heading!);
});

test("search opened immediately after returning from a material survives navigation completion", async ({
  app: { base },
  page,
}) => {
  page.setDefaultTimeout(5000);
  await page.clock.install({ time: new Date("2026-11-12T12:00:00Z") });
  const note = loadCommonKnowledge().notes.find(
    (item) =>
      item.title === "JavaScript" && item.id.startsWith("Собеседования/Темы"),
  )!;
  await page.goto(`${base}/#/themes?note=${encodeURIComponent(note.id)}`);
  await expect(page.locator(".platform-note")).toBeVisible();
  const original = page.url();
  await page.locator('.platform-note a[href^="#/themes"]').first().click();
  await page.waitForFunction((url) => location.href !== url, original);
  await page.locator('[data-action="back"]').click();
  await page.waitForURL(original);
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Поиск материалов" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("searchbox").fill("IndexedDB");
  await expect(dialog.locator(".platform-list-row").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(page.url()).toBe(original);
});

test("search preserves a draft and reading position on desktop and mobile", async ({
  app: { base },
  page,
}) => {
  await page.goto(`${base}/#/sources?mode=manual`);
  const draft = page.getByLabel("Название источника", { exact: true });
  await expect(draft).toBeVisible();
  await draft.fill("Мой незавершённый источник");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 600 });
    await page.locator("#platformMain").focus();
    await page.evaluate(() => window.scrollTo(0, 300));
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("/");
    const dialog = page.getByRole("dialog", { name: "Поиск материалов" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("searchbox").fill("JavaScript");
    await expect(dialog.locator(".platform-list-row").first()).toBeVisible();
    await expect(draft).toHaveValue("Мой незавершённый источник");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "Закрыть поиск" }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await mkdir("artifacts/material-search", { recursive: true });
    await page.screenshot({ path: `artifacts/material-search/${width}.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(draft).toHaveValue("Мой незавершённый источник");
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - before),
    ).toBeLessThanOrEqual(1);
    await page.keyboard.press("/");
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).not.toBeVisible();
  }
});

test("search reports a failed catalog and retries it", async ({
  app: { base },
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/knowledge", async (route) => {
    if (++attempts === 1)
      await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.goto(`${base}/#/themes`);
  await page.getByRole("button", { name: "Найти материал" }).click();
  const dialog = page.getByRole("dialog", { name: "Поиск материалов" });
  await expect(dialog.getByRole("alert")).toContainText("недоступна");
  await dialog.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("searchbox").fill("IndexedDB");
  await expect(dialog.locator(".platform-list-row").first()).toBeVisible();
  await dialog.locator(".platform-list-row").first().click();
  await expect(dialog).not.toBeVisible();
  expect(attempts).toBe(2);
});

test("search shows loading and does not mistake an incomplete catalog for no results", async ({
  app: { base },
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/knowledge", async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto(`${base}/#/themes`);
    await page.getByRole("button", { name: "Найти материал" }).click();
    const dialog = page.getByRole("dialog", { name: "Поиск материалов" });
    await dialog.getByRole("searchbox").fill("несуществующий-запрос-98463");
    await expect(dialog.getByRole("status")).toContainText("Загружаем");
    await expect(
      dialog.getByText("Совпадений нет", { exact: false }),
    ).toHaveCount(0);
    release();
    await expect(
      dialog.getByText("Совпадений нет", { exact: false }),
    ).toBeVisible();
  } finally {
    release();
  }
});
