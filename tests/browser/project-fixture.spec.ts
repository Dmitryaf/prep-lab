import { test as baseTest, expect } from "../helpers/browser.ts";
import { projectFixture } from "../fixtures/projects.ts";
import { readProgress } from "../helpers/browser-progress.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const test = baseTest.extend<{ projectDirectory: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency list.
  projectDirectory: async ({}, use) => {
    const directory = await mkdtemp(
      join(tmpdir(), "frontend-lab-project-fixture-"),
    );
    try {
      await writeFile(
        join(directory, "projects.json"),
        JSON.stringify(projectFixture()),
      );
      await use(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  appOptions: async ({ projectDirectory }, use) => {
    await use({
      projectPackageRoot: projectDirectory,
      knowledgeRoot: join(process.cwd(), "content/common"),
    });
  },
});
test("portable project package supports reading, code copying, shared settings and repeating questions", async ({
  app: { base },
  page,
  context,
}) => {
  await page.goto(base + "/#/projects?projectTopic=first-main");
  await expect(page.locator(".topic-title")).toHaveText("Контракт операции");
  await expect(page.locator(".reading-location")).toContainText(
    "Первый пример",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator(".local-settings summary").click();
  await page.locator("#sourceRoot").fill("C:\\Work\\Example");
  await page.locator("[data-action=copy-source]").first().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split(/\r?\n/)).toEqual([
    "C:\\Work\\Example\\src\\example.ts:1",
    "validateInput",
  ]);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(base + "/api/settings")).json()).settings
          .sourceRoot,
    )
    .toBe("C:\\Work\\Example");
  await page.locator("[data-action=back-to-topics]").click();
  await page.locator("[data-action=project-practice]").click();
  await expect(page.getByText("1 из 18", { exact: true })).toBeVisible();
  await page.locator("[data-action=reveal]").click();
  const title = await page.locator(".question-card h2").innerText();
  await page.locator("[data-rating=again]").click();
  await readProgress(page);
  await page.locator('#platformNav a[href="#/repeat"]').click();
  await expect(page.locator(".platform-list-row")).toContainText(title);
  await page.reload();
  await expect(page.locator(".platform-list-row")).toContainText(title);
});
