import { test, expect } from "#tests/helpers/browser.ts";

test.use({ appOptions: { projectPackageRoot: null } });

test("intensive fields remain distinct from their card on desktop and mobile", async ({
  app: { base },
  page,
}, info) => {
  await page.goto(base + "/#/intensive");
  const input = page.getByLabel("Цель подготовки", { exact: true });
  await expect(input).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const colors = await input.evaluate((element) => ({
      field: getComputedStyle(element).backgroundColor,
      card: getComputedStyle(element.closest(".platform-card")!)
        .backgroundColor,
      border: getComputedStyle(element).borderColor,
    }));
    expect(colors.field).not.toBe(colors.card);
    expect(colors.border).not.toBe(colors.card);
    await input.focus();
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe("none");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`intensive-fields-${width}.png`),
    });
  }
});
