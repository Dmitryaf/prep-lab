import { resolve } from "node:path";
import { test, expect } from "#tests/helpers/browser.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

test("rating confirmation disappears, but a subsequent save error stays visible", async ({
  app: { base },
  page,
}) => {
  const id =
    "ck:Собеседования/Темы/Сети и безопасность#Как связаны HTTP-методы и идемпотентность?";
  await page.goto(base + "/#/practice?question=" + encodeURIComponent(id));
  await page
    .getByRole("button", { name: "Показать ответ", exact: true })
    .click();
  await page.clock.install();
  await page.locator('[data-rating="done"]').click();
  const success = page.getByText("Отметка сохранена.", { exact: true });
  await expect(success).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(success).toHaveCount(0);

  await page.locator('[data-rating="partial"]').click();
  await expect(success).toBeVisible();
  await page.route("**/api/preparation", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Не удалось сохранить отметку." }),
    });
  });
  await page.locator('[data-rating="done"]').click();
  const error = page.getByText("Не удалось сохранить отметку.", {
    exact: true,
  });
  await expect(error).toBeVisible();
  await page.clock.fastForward(10_000);
  await expect(success).toHaveCount(0);
  await expect(error).toBeVisible();
});
