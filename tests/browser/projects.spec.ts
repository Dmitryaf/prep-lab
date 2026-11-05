import { ownerAvailable } from "../helpers/owner-package.ts";
import { readProgress } from "../helpers/browser-progress.ts";
import { test, expect } from "../helpers/browser.ts";
import { mkdir } from "node:fs/promises";
import { restoreProgressFixture } from "../helpers/browser-progress.ts";
import { topics, projects } from "../helpers/owner-package.ts";

test("projects", async ({
  app: { base },
  context,
  page,
  pageErrors: errors,
}) => {
  test.skip(
    !ownerAvailable,
    "Совместимость личного пакета проверяется только при его наличии.",
  );
  const state = () => readProgress(page);
  const open = async (id: string) => {
    await page.goto(base + "/#/projects?projectTopic=" + id);
    await expect(page.locator(".topic-title")).toHaveText(
      topics.find((topic) => topic.id === id)!.title,
    );
  };
  await mkdir("artifacts/vue-migration", { recursive: true });

  await page.goto(base + "/?projects=1");
  await page.locator(".topic-row").first().waitFor();
  await expect(page.locator("iframe")).toHaveCount(0);
  const v1 = { "tr-purpose": { status: "done" as const, updatedAt: "old" } };
  await page.evaluate(
    (v) => localStorage.setItem("project-map-review-v1", JSON.stringify(v)),
    v1,
  );
  await page.reload();
  await page.getByRole("button", { name: /Inbox Point.*тем/ }).click();
  await page.locator("#inlineSearch").fill("React");
  expect((await page.locator(".topic-row").count()) > 0).toBeTruthy();
  await page.locator(".topic-row").first().click();
  await page
    .getByRole("button", { name: "✓ Могу объяснить", exact: true })
    .click();
  expect((await state()).progress["tr-purpose"]).toEqual(v1["tr-purpose"]);
  expect((await state()).questionProgress).toEqual({});
  const before = await state();
  await expect(
    restoreProgressFixture(page, '{"version":3}'),
  ).rejects.toBeDefined();
  expect(await state()).toEqual(before);
  await page.evaluate(() => localStorage.removeItem("project-map-platform-v3"));
  await page.reload();
  await restoreProgressFixture(page, before);
  expect(await state()).toEqual(before);
  // Every topic renders all four native blocks; answers and full code remain collapsed.
  for (const topic of topics) {
    await open(topic.id);
    await page.locator("#details").waitFor();
    expect(
      await page.locator(".topic-sections>section>h3").allTextContents(),
    ).toEqual([
      "Как это работает",
      "Что нужно изучить",
      "Вопросы на собеседовании",
      "Реализация в коде",
    ]);
    await expect(page.locator("details.interview-question")).toHaveCount(
      topic.pilot.questions.length,
    );
    await expect(page.locator("details.interview-question[open]")).toHaveCount(
      0,
    );
    await page.locator("details.interview-question summary").first().click();
    await expect(page.locator(".interview-answer").first()).toBeVisible();
    const full = page.locator("details.code-full");
    if (await full.count()) {
      expect(await full.getAttribute("open")).toBe(null);
      await full.locator("summary").click();
      await expect(full.locator(".code-step")).toHaveCount(
        topic.pilot.code.steps.length,
      );
      for (const [index, step] of topic.pilot.code.steps.entries())
        if (step.project === "cokr")
          await expect(full.locator(`[data-index="${index}"]`)).toHaveCount(1);
    }
  }
  // All 17 routes and all 177 review questions remain reachable in the same app.
  await page.goto(base + "/#/projects");
  await page.locator("[data-action=mode][data-mode=map]").click();
  let routes = 0;
  for (const p of Object.values(projects)) {
    await page.locator(`[data-action=project][data-project=${p.id}]`).click();
    for (const r of p.routes) {
      await page.locator("#projectRoute").selectOption(r.id);
      await expect(page.locator(".route-topics li")).toHaveCount(
        r.nodes.length,
      );
      routes++;
    }
  }
  expect(routes).toBe(17);
  await page.locator("[data-action=mode][data-mode=review]").click();
  await page.getByLabel("Охват", { exact: true }).selectOption("both");
  await page.getByLabel("Набор", { exact: true }).selectOption("all");
  expect(
    (await page.locator("#platformMain").innerText()).includes("1 из 177"),
  ).toBeTruthy();
  const seen = new Set();
  for (let i = 0; i < 177; i++) {
    const title = await page.locator(".question-card h2").innerText();
    seen.add(title);
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await page.locator("[data-action=reveal]").click();
    await expect(page.locator(".platform-answer")).toBeVisible();
    await page.locator("[data-action=next-question]").click();
  }
  expect(seen.size > 140).toBeTruthy();
  await page.locator("#reviewMode").selectOption("quick");
  expect(
    (await page.locator("#platformMain").innerText()).includes("1 из 50"),
  ).toBeTruthy();
  // Copy a corporate source: both clipboard and deliberate denial / fallback.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open("ln-registration");
  await page.locator(".local-settings summary").click();
  await page.locator("#sourceRoot").fill("C:\\Work\\cokr");
  await page.locator("[data-action=copy-source]").first().click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(base + "/api/settings")).json()).settings
          .sourceRoot,
    )
    .toBe("C:\\Work\\cokr");
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).startsWith(
      "C:\\Work\\cokr\\src\\",
    ),
  ).toBeTruthy();
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => {
        throw Error("Denied");
      },
    });
  });
  await page.locator("[data-action=copy-source]").first().click();
  await page.locator("#sourceReference").waitFor();
  expect(
    (await page.locator("#sourceReference").inputValue()).includes(
      "C:\\Work\\cokr\\src\\",
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/vue-migration/native-map-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/vue-migration/native-map-mobile.png",
    fullPage: true,
  });
  await page.goto(base + "/#topic=tr-local");
  await page.locator("#details").waitFor();
  await expect(page.locator("#details .topic-title")).toContainText(
    "IndexedDB",
  );
  expect(errors).toEqual([]);
  console.log(
    "PASS native Vue map: 50 four-block topics, 177 review questions, quick50, routes17, v1/validated fixtures, clipboard/fallback, old links, desktop/mobile, no iframe",
  );
});
