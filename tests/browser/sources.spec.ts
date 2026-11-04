import { test, expect } from "../helpers/browser.ts";
test.use({ appOptions: { projectPackageRoot: null } });
const markdown = (answer: string) =>
  `# Своя заметка\n## Свой вопрос\n> [!answer]- Ответ\n> ${answer}\n`;
test("upload preview, acceptance, repeat, local edit and conflicting update survive reload", async ({
  app: { base },
  page,
}) => {
  await page.goto(base + "/#/sources");
  await expect(
    page.getByRole("heading", { name: "Свои материалы" }),
  ).toBeVisible();
  await page.getByLabel("Название источника").fill("Личная база");
  await page.getByLabel("Markdown или ZIP").setInputFiles({
    name: "Моя заметка.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown("Внешний ответ.")),
  });
  await page.getByRole("button", { name: "Подготовить изменения" }).click();
  await expect(
    page.getByRole("heading", { name: "Просмотр изменений" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/sources/review-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/sources/review-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const before = await (await page.request.get(base + "/api/knowledge")).json();
  expect(
    before.questions.some((q: { title: string }) => q.title === "Свой вопрос"),
  ).toBe(false);
  await page.reload();
  await page
    .getByRole("button", { name: "Продолжить просмотр: Личная база" })
    .click();
  await page.getByRole("button", { name: "Принять изменения" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Материалы обновлены" }),
  ).toBeVisible();
  const accepted = await (
    await page.request.get(base + "/api/knowledge")
  ).json();
  const original = accepted.questions.find(
    (q: { title: string }) => q.title === "Свой вопрос",
  );
  expect(original).toBeTruthy();
  await page.getByText("Материалы источника", { exact: true }).click();
  await page
    .getByRole("button", { name: "Редактировать Моя заметка.md" })
    .click();
  await page.getByLabel("Текст материала").fill(markdown("Моя правка."));
  await page.getByRole("button", { name: "Просмотреть правку" }).click();
  await page.getByRole("button", { name: "Принять изменения" }).click();
  await page.getByRole("button", { name: "Обновить Личная база" }).click();
  await page.getByLabel("Markdown или ZIP").setInputFiles({
    name: "Моя заметка.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown("Новый внешний ответ.")),
  });
  await page.getByRole("button", { name: "Подготовить изменения" }).click();
  await expect(
    page
      .locator(".source-change")
      .getByText("Конфликт правок", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Принять изменения" }),
  ).toBeDisabled();
  await page.getByLabel("Решение для Моя заметка.md").selectOption("current");
  await page.getByRole("button", { name: "Принять изменения" }).click();
  await page.reload();
  const final = await (await page.request.get(base + "/api/knowledge")).json();
  const question = final.questions.find(
    (q: { id: string }) => q.id === original.id,
  );
  expect(question.answer).toContain("Моя правка.");
  await page.goto(
    base + "/#/practice?question=" + encodeURIComponent(original.id),
  );
  await expect(page.locator(".question-card h2")).toHaveText("Свой вопрос");
  await page
    .getByRole("button", { name: "Показать ответ", exact: true })
    .click();
  await page.locator('[data-rating="again"]').click();
  await expect(page.locator('[data-rating="again"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto(base + "/#/repeat");
  await expect(page.getByText("Свой вопрос", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
