import { test, expect } from "#tests/helpers/browser.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";

test.use({ appOptions: { projectPackageRoot: null } });

test("project code opens in the topic and the map with line numbers, highlighting and exact copying", async ({
  app: { base },
  page,
  context,
}, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const catalog = projectFixture();
  const step = catalog.topics[0].pilot.code.steps[0];
  const text =
    'const message: string = "<img src=x onerror=alert(1)>";\n// comment\nreturn { message, count: 42, ok: true };';
  Object.assign(step, { preview: { text, startLine: 12 } });
  await page.route("**/api/projects", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.goto(base + "/#/projects?projectTopic=first-main");
  await page.getByRole("button", { name: /Реализация в коде/ }).click();
  await page.getByText("Показать код", { exact: true }).first().click();
  const preview = page.locator(".code-preview").first();
  await expect(preview.locator(".code-line")).toHaveCount(3);
  await expect(preview.locator(".code-line-number")).toHaveText([
    "12",
    "13",
    "14",
  ]);
  await expect(preview.locator(".hljs-keyword").first()).toHaveText("const");
  const contrast = await preview.locator("pre").evaluate((element) => {
    const luminance = (color: string) => {
      const rgb = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const background = luminance(getComputedStyle(element).backgroundColor);
    return [
      ...element.querySelectorAll("code, code span, .code-line-number"),
    ].map((node) => {
      const foreground = luminance(getComputedStyle(node).color);
      return (
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05)
      );
    });
  });
  expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
  expect(
    await preview
      .locator("code")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(13);
  await expect(preview.locator("img")).toHaveCount(0);
  await preview
    .getByRole("button", { name: "Копировать код", exact: true })
    .click();
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      "\r\n",
      "\n",
    ),
  ).toBe(text);
  await preview.screenshot({
    path: info.outputPath("code-preview-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("project-code-mobile.png"),
    fullPage: true,
  });
  await page.goto(base + "/#/projects?project=first&mapView=structure");
  await page.locator('[data-map-node="module:Сценарии"]').click();
  await page.locator(".project-map-code > summary").click();
  await page.getByText("Показать код", { exact: true }).first().click();
  await expect(page.locator(".code-preview").first()).toContainText(
    "const message",
  );
});
