import { test, expect } from "../helpers/browser.ts";
import { resolve } from "node:path";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

test("bundled lab downloads and performance exercises work without personal sources", async ({
  app: { base },
  page,
  request,
}) => {
  for (const name of ["request-lifecycle", "react-behavior"]) {
    const head = await request.head(`${base}/labs/${name}.zip`);
    expect(head.status()).toBe(200);
    const download = await request.get(`${base}/labs/${name}.zip`);
    expect(download.status()).toBe(200);
    expect((await download.body()).subarray(0, 4).toString("hex")).toBe(
      "504b0304",
    );
  }
  await page.goto(
    `${base}/#/themes?note=${encodeURIComponent("Фронтенд/Практикумы/00. Карта раздела")}`,
  );
  await expect(page.getByRole("link", { name: "Скачать ZIP" })).toHaveCount(2);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Скачать ZIP" }).first().click();
  expect((await downloadEvent).suggestedFilename()).toBe(
    "request-lifecycle.zip",
  );
  await page.getByRole("link", { name: "Открыть стенд" }).click();
  await expect(page).toHaveURL(`${base}/labs/performance-lab.html`);
  await page.getByRole("button", { name: "Показать таблицу" }).click();
  await expect(page.locator("#rows tr")).toHaveCount(5000);
  await page.getByLabel("Исправленный режим").check();
  await page.getByRole("button", { name: "Показать таблицу" }).click();
  await expect(page.locator("#rows tr")).toHaveCount(80);
  await expect(
    page.locator("#rows tr").first().locator("td").first(),
  ).toHaveText("1");
  await page.getByRole("button", { name: "Следующая", exact: true }).click();
  await expect(
    page.locator("#rows tr").first().locator("td").first(),
  ).toHaveText("81");
  await page.getByRole("button", { name: "Предыдущая", exact: true }).click();
  await expect(
    page.locator("#rows tr").first().locator("td").first(),
  ).toHaveText("1");
  await page
    .getByRole("button", { name: "Открыть панель", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Закрыть панель", exact: true })
    .click();
  await expect(page.locator("#memory-result")).toHaveText(
    "Активных подписок: 0",
  );
  await page.getByLabel("Исправленный режим").uncheck();
  await page
    .getByRole("button", { name: "Открыть панель", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Закрыть панель", exact: true })
    .click();
  await expect(page.locator("#memory-result")).toHaveText(
    "Активных подписок: 1",
  );
  await page.getByRole("button", { name: "Очистить подписки" }).click();
  await expect(page.locator("#memory-result")).toHaveText(
    "Активных подписок: 0",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Исправленный режим").check();
  await page.getByLabel("Введите несколько символов подряд").fill("Тест");
  await expect(page.locator("#input-result")).toContainText("Текст: Тест");
});
