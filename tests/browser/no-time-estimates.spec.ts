import { test, expect } from "#tests/helpers/browser.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";
import { join } from "node:path";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: join(process.cwd(), "content/common"),
  },
});

test("interview, practice and project blocks have no estimated completion times", async ({
  app: { base },
  page,
}, info) => {
  const catalog = projectFixture();
  catalog.topics[0].minutes = 999;
  await page.route("**/api/projects", (route) =>
    route.fulfill({ json: catalog }),
  );
  const estimate = /\d+(?:[–-]\d+)?\s*(?:минут|мин\b)/u;
  await page.goto(base + "/#/interview");
  await expect(page.locator(".daily-card")).toBeVisible();
  await expect(page.locator(".daily-card .platform-meta")).not.toContainText(
    estimate,
  );
  await expect(page.locator(".interview-formats")).not.toContainText(estimate);
  await page.screenshot({
    path: info.outputPath("interview-no-times.png"),
    fullPage: true,
  });
  await page.locator('input[value="coding"]').check();
  await page.locator('[data-action="full"]:enabled').click();
  await expect(
    page.locator(".question-card > .platform-meta"),
  ).not.toContainText(estimate);
  await page.goto(base + "/#/projects?projectTopic=first-main");
  await expect(page.locator(".topic-title")).toHaveText("Контракт операции");
  await expect(page.locator(".topic-intro > .platform-meta")).not.toContainText(
    estimate,
  );
  await page.goto(base + "/#/projects?project=first&mode=review");
  await expect(page.locator(".platform-filters")).not.toContainText(estimate);
});
