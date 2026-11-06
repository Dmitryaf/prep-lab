import { ownerAvailable } from "#tests/helpers/owner-package.ts";
import { test, expect } from "#tests/helpers/browser.ts";
import { mkdirSync } from "node:fs";

test("project navigation", async ({
  app: { base },
  page,
  pageErrors: errors,
}) => {
  test.skip(
    !ownerAvailable,
    "Совместимость личного пакета проверяется только при его наличии.",
  );
  mkdirSync("artifacts/ui-refresh", { recursive: true });
  async function visibleTitle() {
    await page.locator(".topic-title").waitFor();
    await page.waitForFunction(() => {
      const r = document.querySelector(".topic-title")!.getBoundingClientRect();
      return r.top >= 0 && r.bottom < innerHeight;
    });
    await expect(page.locator(".topic-row")).toHaveCount(0);
    await expect(page.locator("#inlineSearch")).toHaveCount(0);
  }

  await page.goto(base + "/#/projects");
  await page.locator('[data-mode="topics"]').click();
  await page.locator(".topic-row").first().waitFor();
  await page.screenshot({
    path: "artifacts/ui-refresh/projects-desktop.png",
    fullPage: false,
  });
  await page
    .getByLabel("Раздел", { exact: true })
    .selectOption({ label: "Сценарии" });
  await page.locator("#inlineSearch").fill("");
  const item = page.locator(".topic-row").last(),
    id = await item.getAttribute("data-topic-id"),
    title = await item.locator("strong").innerText();
  await item.click();
  await visibleTitle();
  await expect(page.locator(".topic-title")).toHaveText(title);
  await page.screenshot({
    path: "artifacts/ui-refresh/reader-desktop.png",
    fullPage: false,
  });
  await page.reload();
  await visibleTitle();
  await expect(page.locator(".topic-title")).toHaveText(title);
  await page
    .getByRole("navigation", { name: "В этом разборе", exact: true })
    .getByRole("button", { name: /Реализация в коде/ })
    .click();
  const code = page.locator("[data-section=code]>h3");
  expect(
    await code.evaluate(
      (el) =>
        el.getBoundingClientRect().top >= 0 &&
        el.getBoundingClientRect().top < innerHeight,
    ),
  ).toBeTruthy();
  await page.locator("[data-action=back-to-topics]").click();
  await page.locator(".topic-row").first().waitFor();
  expect(await page.getByLabel("Раздел", { exact: true }).inputValue()).toBe(
    "Сценарии",
  );
  expect(await page.locator("#inlineSearch").inputValue()).toBe("");
  const returned = page.locator(`[data-topic-id="${id}"]`);
  expect(
    await returned.evaluate((el) => el === document.activeElement),
  ).toBeTruthy();
  await returned.press("Enter");
  await visibleTitle();
  await page.goBack();
  await returned.waitFor();
  expect(await page.getByLabel("Раздел", { exact: true }).inputValue()).toBe(
    "Сценарии",
  );
  await page.locator("#inlineSearch").fill(title);
  await page.locator(".topic-row").first().click();
  await visibleTitle();
  await page.reload();
  await visibleTitle();
  await page.locator("[data-action=back-to-topics]").click();
  expect(await page.locator("#inlineSearch").inputValue()).toBe(title);
  await page.goto(base + "/#/projects");
  await page.locator("[data-action=mode][data-mode=map]").click();
  await page.locator(".route-topics a").first().click();
  await visibleTitle();
  await page.locator(".route-navigation .platform-button").last().click();
  await page.reload();
  await visibleTitle();
  await page.getByRole("button", { name: "← К маршруту", exact: true }).click();
  await page.locator("#projectRoute").waitFor();
  expect((await page.locator(".route-topics li").count()) > 1).toBeTruthy();
  await page.goto(base + "/#/projects?projectTopic=missing-topic");
  await page
    .getByRole("heading", { name: "Тема не найдена", exact: true })
    .waitFor();
  await expect(page.locator("#details")).toHaveCount(0);
  await page.goto(base + "/#/themes");
  await page.locator(".knowledge-subgroup").first().waitFor();
  await expect(page.locator(".knowledge-subgroup[open]")).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/ui-refresh/library-desktop.png",
    fullPage: false,
  });
  await page.goto(base + "/#/interview");
  await page.locator("[data-action=daily]").waitFor();
  await page.screenshot({
    path: "artifacts/ui-refresh/interview-desktop.png",
    fullPage: false,
  });
  await page.goto(base + "/#/practice");
  await page.locator("[data-action=reveal]").click();
  await page.screenshot({
    path: "artifacts/ui-refresh/practice-desktop.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/#/projects");
  await page.locator('[data-mode="topics"]').click();
  await page.locator(".topic-row").last().click();
  await visibleTitle();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/ui-refresh/reader-mobile.png",
    fullPage: false,
  });
  await page.locator("[data-action=back-to-topics]").click();
  await page.locator(".topic-row").first().waitFor();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/ui-refresh/projects-mobile.png",
    fullPage: false,
  });
  await page.goto(base + "/#/practice");
  await page.locator("[data-action=reveal]").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/ui-refresh/practice-mobile.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/#/projects?projectTopic=tr-purpose");
  await visibleTitle();
  await page.screenshot({
    path: "artifacts/ui-refresh/reader-purpose-desktop.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await visibleTitle();
  await page.screenshot({
    path: "artifacts/ui-refresh/reader-purpose-mobile.png",
    fullPage: false,
  });
  for (const width of [760, 850, 1024, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + "/#/projects?projectTopic=tr-purpose");
    await visibleTitle();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Reader overflow at ${width}px`,
    ).toBeTruthy();
    if (width > 760)
      expect(
        await page.evaluate(
          () =>
            document.querySelector(".platform-header")!.getBoundingClientRect()
              .right <=
            document
              .querySelector(".platform-workspace")!
              .getBoundingClientRect().left,
        ),
        "Navigation overlaps reading surface",
      ).toBeTruthy();
    await page.goto(base + "/#/interview");
    await page.locator("[data-action=daily]").waitFor();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Interview overflow at ${width}px`,
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS UI workflow: immediate reader, reload, return context/focus, keyboard, outline, invalid link, compact library, five screens, mobile/tablet/desktop",
  );
});
