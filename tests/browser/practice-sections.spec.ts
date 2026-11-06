import { test, expect } from "#tests/helpers/browser.ts";
import { knowledgeForProfile } from "#domain/knowledge/profile.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";

test.use({ appOptions: { projectPackageRoot: null } });

test("advanced practice is separate, survives navigation and keeps existing question links", async ({
  app: { base },
  page,
  request,
}, info) => {
  const knowledge: Knowledge = await (
    await request.get(base + "/api/knowledge")
  ).json();
  await page.goto(base + "/#/practice");
  const sections = page.getByRole("navigation", { name: "Разделы практики" });
  const counter = page.locator("#platformMain .platform-meta").first();
  for (const profile of ["vue", "react"] as const) {
    const bank = knowledgeForProfile(knowledge, profile);
    const advanced = bank.questions.filter((q) => q.codingRole === "advanced");
    const standard = bank.questions.filter((q) => q.codingRole !== "advanced");
    expect(advanced.length).toBeGreaterThan(0);
    await page.locator("#preparationProfile").selectOption(profile);
    await sections
      .getByRole("link", { name: "Основная практика", exact: true })
      .click();
    await page.locator("#practiceCategory").selectOption("mixed");
    await expect(counter).toHaveText(`1 из ${standard.length}`);
    await sections
      .getByRole("link", { name: "Дополнительная практика", exact: true })
      .click();
    await expect(
      sections.getByRole("link", { name: "Дополнительная практика" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(counter).toHaveText(`1 из ${advanced.length}`);
    for (let i = 0; i < advanced.length; i++) {
      await expect(page.locator(".question-card h2")).toHaveText(
        advanced[i].title,
      );
      await page.locator('[data-action="next-question"]').click();
    }
    await page.reload();
    await expect(counter).toHaveText(`1 из ${advanced.length}`);
    await expect(
      sections.getByRole("link", { name: "Дополнительная практика" }),
    ).toHaveAttribute("aria-current", "page");
    await page.locator("#practiceCategory").selectOption(advanced[0].category);
    const categoryPool = advanced.filter(
      (q) => q.category === advanced[0].category,
    );
    await expect(counter).toHaveText(`1 из ${categoryPool.length}`);
    await page.locator('[data-action="random-question"]').click();
    expect(categoryPool.map((q) => q.title)).toContain(
      await page.locator(".question-card h2").innerText(),
    );
    await page.goto(
      base +
        "/#" +
        new URLSearchParams({ view: "practice", question: advanced[0].id }),
    );
    await expect(page.locator(".question-card h2")).toHaveText(
      advanced[0].title,
    );
    await expect(
      sections.getByRole("link", { name: "Дополнительная практика" }),
    ).toHaveAttribute("aria-current", "page");
    await page.locator('[data-action="next-question"]').click();
    await expect(page).toHaveURL(/level=advanced/);
    await expect(page.locator(".question-card h2")).toHaveText(
      advanced[1 % advanced.length].title,
    );
    await page.goBack();
    await expect(page.locator(".question-card h2")).toHaveText(
      advanced[0].title,
    );
    await sections
      .getByRole("link", { name: "Основная практика", exact: true })
      .click();
    await expect(page.locator("#practiceCategory")).toHaveValue("route");
    await expect(counter).toHaveText(
      `1 из ${bank.route.filter((id) => standard.some((q) => q.id === id)).length}`,
    );
  }
  await sections.getByRole("link", { name: "Дополнительная практика" }).click();
  await page.screenshot({
    path: info.outputPath("practice-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    sections.getByRole("link", { name: "Дополнительная практика" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("practice-mobile.png"),
    fullPage: true,
  });
});

test("learning sections show headings without introductory instructions", async ({
  app: { base },
  page,
}, info) => {
  for (const route of [
    "interview",
    "practice",
    "themes",
    "projects",
    "repeat",
  ]) {
    await page.goto(base + "/#/" + route);
    await expect(page.locator("#platformMain .page-heading h1")).toBeVisible();
    await expect(
      page.locator("#platformMain .page-heading .platform-lead"),
    ).toHaveCount(0);
  }
  await page.goto(base + "/#/interview");
  await expect(
    page.getByText("Выберите, что хотите потренировать.", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Открывайте ответ после самостоятельной попытки.", {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(4);
  await page.screenshot({
    path: info.outputPath("interview-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("interview-mobile.png"),
    fullPage: true,
  });
});
