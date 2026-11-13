import { test, expect } from "#tests/helpers/browser.ts";
import { readProgress } from "#tests/helpers/browser-progress.ts";

test.use({ appOptions: { projectPackageRoot: null } });
const title = "Запросы через одно соединение: ответы не по порядку";
const id = "ck:Собеседования/Практика/Асинхронные контракты#" + title;

test("topics are visible before the solution and navigation preserves the selected question", async ({
  app: { base },
  page,
}, info) => {
  await page.goto(base + "/#/practice?question=" + encodeURIComponent(id));
  const topics = page.getByRole("complementary", { name: "Полезные темы" });
  await expect(topics).toBeVisible();
  await expect(topics.getByRole("link")).toHaveCount(4);
  await expect(topics.locator("a > span:first-child")).toHaveText([
    "Promise — базовая модель и цепочки",
    "AbortController и race condition в запросах",
    "REST, GraphQL и WebSocket",
    "Map, Set, WeakMap и WeakSet",
  ]);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await expect(page.locator(".question-source")).toHaveCount(0);
  await expect(page.locator(".question-card")).not.toContainText(
    /Тип источника|атрибуци|предоставленн|публичного задания/i,
  );
  const initial = await readProgress(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const main = await page.locator(".question-workspace-main").boundingBox();
  const sidebar = await topics.boundingBox();
  expect(sidebar!.x).toBeGreaterThan(main!.x + main!.width);
  expect(Math.abs(sidebar!.y - main!.y)).toBeLessThanOrEqual(2);
  await page.screenshot({
    path: info.outputPath("topics-desktop.png"),
    fullPage: true,
  });
  await topics
    .getByRole("link", { name: /Promise — базовая модель и цепочки/ })
    .click();
  await expect(page.locator(".platform-note")).toBeVisible();
  await page.locator("[data-action=back]").click();
  await expect(
    page.getByRole("textbox", { name: "Моя попытка", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  expect(await readProgress(page)).toEqual(initial);
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowMain = await page.locator(".question-card").boundingBox();
  const narrowSide = await topics.boundingBox();
  expect(narrowSide!.y).toBeGreaterThan(narrowMain!.y + narrowMain!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("topics-mobile.png"),
    fullPage: true,
  });
});

test("reading theory during a full interview keeps its position without revealing the answer", async ({
  app: { base },
  page,
}) => {
  await page.goto(base + "/#/interview");
  await page.locator('input[value="coding"]').check();
  await page.locator('[data-action="full"]:enabled').click();
  const topics = page.getByRole("complementary", {
    name: "Материалы к вопросу",
  });
  await expect(topics).toBeVisible();
  const initial = await readProgress(page);
  await topics.getByRole("link").first().click();
  await expect(page.locator(".platform-note")).toBeVisible();
  await page.locator("[data-action=back]").click();
  await expect(
    page.getByRole("textbox", { name: "Моя попытка", exact: true }),
  ).toHaveCount(0);
  expect(await readProgress(page)).toEqual(initial);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await expect(page.locator('[data-action="session-next"]')).toBeVisible();
});
