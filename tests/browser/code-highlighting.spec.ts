import { test, expect } from "#tests/helpers/browser.ts";

test.use({ appOptions: { projectPackageRoot: null } });

const code =
  'const message: string = "<img src=x onerror=alert(1)>";\n// комментарий\nconsole.log(message);';
const question = {
  id: "highlight-example",
  title: "Объясните этот пример",
  kind: "practice",
  source: "knowledge",
  category: "TypeScript",
  prompt: `\`\`\`ts\n${code}\n\`\`\``,
  answer: '```html\n<button type="button">Сохранить</button>\n```',
  availableAnswer: true,
  followups: [],
  learningLinks: [],
  criteria: "Объяснить код",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/knowledge", (route) =>
    route.fulfill({
      json: {
        notes: [],
        questions: [question],
        route: [question.id],
        warnings: [],
      },
    }),
  );
});

test("answer editor has one visible title while retaining its accessible label", async ({
  app: { base },
  page,
}) => {
  await page.goto(`${base}/#/practice?question=${question.id}`);
  const attempt = page.locator(".answer-attempt");
  await expect(attempt.getByText("Моя попытка", { exact: true })).toHaveCount(
    1,
  );
  await page
    .getByRole("textbox", { name: "Моя попытка", exact: true })
    .fill("Мой ответ");
  await expect(
    page.getByRole("textbox", { name: "Моя попытка", exact: true }),
  ).toHaveValue("Мой ответ");
});

test("highlighted prompts and answers keep inert markup and exact clipboard text", async ({
  app: { base },
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${base}/#/practice?question=${question.id}`);
  const block = page.locator(".question-card pre code").first();
  await expect(block.locator(".hljs-keyword").first()).toBeVisible();
  await expect(block.locator(".hljs-string")).toBeVisible();
  expect(await block.textContent()).toBe(code);
  await expect(block.locator("img, script, button")).toHaveCount(0);
  const color = await block
    .locator(".hljs-keyword")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe(
    await block.evaluate((el) => getComputedStyle(el).color),
  );
  await block.evaluate((el) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Control+c");
  // Windows clipboard converts line endings; token markup must not alter source text.
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe(code);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.locator("[data-action=reveal]").click();
  const answer = page.locator(".platform-answer pre code");
  await expect(answer.locator(".hljs-tag").first()).toBeVisible();
  expect(await answer.textContent()).toBe(
    '<button type="button">Сохранить</button>',
  );
  await expect(answer.locator("button")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("code-highlighting-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("code-highlighting-mobile.png"),
    fullPage: true,
  });
});
