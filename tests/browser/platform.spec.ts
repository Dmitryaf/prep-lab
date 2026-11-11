import { ownerAvailable, ownerCatalog } from "#tests/helpers/owner-package.ts";
import { projectQuestions } from "#ui/entities/project/model/questions.ts";
import {
  knowledgeForProfile,
  supportsQuestion,
} from "#domain/knowledge/profile.ts";
import { isTestingTask } from "#domain/knowledge/question.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";
import { required } from "#tests/helpers/values.ts";

import { readProgress } from "#tests/helpers/browser-progress.ts";
import { test, expect } from "#tests/helpers/browser.ts";
import { mkdir } from "node:fs/promises";
import { restoreProgressFixture } from "#tests/helpers/browser-progress.ts";

test("platform", async ({ app: { base }, page, pageErrors: errors }) => {
  page.setDefaultTimeout(20_000);
  test.skip(
    !ownerAvailable,
    "Совместимость личного пакета проверяется только при его наличии.",
  );
  const state = () => readProgress(page);
  const projectCount = projectQuestions(
    ownerCatalog.topics,
    ownerCatalog.projects,
    ownerCatalog.experience,
  ).filter((question) => supportsQuestion(question, "vue")).length;
  const go = async (
    view: "interview" | "practice" | "themes" | "projects" | "repeat",
  ) => {
    await page.locator(`#platformNav a[href="#/${view}"]`).click();
    await page
      .locator("#platformMain h1")
      .filter({
        hasText: {
          interview: "Пробное интервью",
          practice: "Практика",
          themes: "Темы",
          projects: "Проекты",
          repeat: "Повторить",
        }[view],
      })
      .waitFor();
  };
  await mkdir("artifacts", { recursive: true });
  try {
    await page.clock.install({ time: new Date("2026-10-28T12:00:00+05:00") });
    await page.goto(base);
    await page.locator("[data-action=daily]:enabled").waitFor();
    const bank = knowledgeForProfile(
      (await (
        await page.request.get(`${base}/api/knowledge`)
      ).json()) as Knowledge,
      "vue",
    );
    const routeCount = bank.route.filter((id) =>
      bank.questions.some(
        (question) =>
          question.id === id &&
          !isTestingTask(question) &&
          question.codingRole !== "advanced",
      ),
    ).length;
    for (const view of [
      "interview",
      "practice",
      "themes",
      "projects",
      "repeat",
      "sources",
    ])
      await expect(
        page.locator(`#platformNav a[href="#/${view}"]`),
      ).toBeVisible();
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(255, 255, 255)");
    await page.screenshot({
      path: "artifacts/platform-desktop.png",
      fullPage: true,
    });
    await page.locator("[data-action=daily]").click();
    await page.locator("[data-action=session-skip]").waitFor();
    const first = (await state()).daily["2026-10-28"];
    expect(first.questionIds.length >= 7).toBeTruthy();
    expect(
      Object.values(first.snapshots).filter((q) => q.kind === "project")
        .length === 2,
    ).toBeTruthy();
    expect(
      Object.values(first.snapshots).filter(
        (q) => q.category === "Vue" && q.kind === "theory",
      ).length >= 2,
    ).toBeTruthy();
    expect(
      Object.values(first.snapshots).every(
        (q) => q.source === "projects" || q.curriculumTier === "core",
      ),
    ).toBeTruthy();
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await expect(page.locator("#platformSearch")).toBeDisabled();
    await page.screenshot({
      path: "artifacts/platform-interview.png",
      fullPage: true,
    });
    const q = first.snapshots[first.questionIds[0]];
    if (await page.locator("[data-action=session-followup]").count()) {
      await page.locator("[data-action=session-followup]").click();
      await expect(page.locator(".question-card h2")).toHaveText(q.title);
      const clarification = page.locator(".followup-question h3").first();
      await expect(clarification).toBeVisible();
      const selected = await clarification.innerText();
      expect(q.followups!.includes(selected)).toBeTruthy();
      await page.reload();
      await page.locator("[data-action=session-next]").waitFor();
      await expect(page.locator(".question-card h2")).toHaveText(q.title);
      await expect(clarification).toHaveText(selected);
      await page.locator("[data-action=session-previous]").click();
      await expect(clarification).toHaveCount(0);
      await expect(
        page.locator("[data-action=session-followup]"),
      ).toBeVisible();
    }
    await page.locator("[data-action=session-skip]").click();
    await page.reload();
    await page.locator("[data-action=session-skip]").waitFor();
    expect((await state()).daily["2026-10-28"].index).toBe(1);
    expect((await state()).daily["2026-10-28"].questionIds).toEqual(
      first.questionIds,
    );
    for (
      let guard = 0;
      await page.locator("[data-action=session-skip]").count();
      guard++
    ) {
      expect(guard < 25).toBeTruthy();
      await expect(page.locator(".platform-answer")).toHaveCount(0);
      await page.locator("[data-action=session-skip]").click();
      await state();
    }
    await expect(page.locator(".platform-answer")).toHaveCount(
      first.questionIds.length,
    );
    await page.locator("[data-rating=partial]").first().click();
    const markedId = first.questionIds[0];
    await go("repeat");
    await expect(page.locator(".platform-list-row")).toHaveCount(1);
    await page.locator(".platform-list-row").click();
    await page.locator("[data-action=reveal]").click();
    await page.locator("[data-rating=done]").click();
    await go("repeat");
    await expect(page.locator(".platform-list-row")).toHaveCount(0);
    await go("practice");
    await page.locator("#practiceCategory").selectOption("route");
    await expect(
      page.locator("#platformMain .platform-meta").first(),
    ).toHaveText(`1 из ${routeCount}`);
    await page.locator("[data-action=reveal]").click();
    await page.screenshot({
      path: "artifacts/platform-answer.png",
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Карточка в базе", exact: true })
      .click();
    await page.locator(".platform-note").waitFor();
    await page.screenshot({
      path: "artifacts/platform-note.png",
      fullPage: true,
    });
    const noteURL = page.url();
    const wiki = page.locator('.platform-note a[href^="#/themes"]').first();
    if (await wiki.count()) {
      await wiki.click();
      await page.waitForFunction((url) => location.href !== url, noteURL);
      await page.locator("[data-action=back]").click();
      await page.waitForURL(noteURL);
    }
    await page.keyboard.press("/");
    expect(
      await page
        .locator("#platformSearch")
        .evaluate((e) => e === document.activeElement),
    ).toBe(true);
    await page.locator("#platformSearch").fill("IndexedDB");
    expect((await page.locator(".platform-list-row").count()) > 0).toBeTruthy();
    await page.keyboard.press("Escape");
    await go("projects");
    await expect(page.locator("iframe")).toHaveCount(0);
    const frame = page;
    await frame.locator("[data-action=mode][data-mode=topics]").click();
    await frame.locator(".topic-row").first().click();
    await frame
      .getByRole("button", { name: "✓ Могу объяснить", exact: true })
      .click();
    await expect(
      frame.getByRole("button", { name: "← К списку тем", exact: true }),
    ).toHaveCount(1);
    await frame.locator(".study-links a").first().click();
    await page.locator(".platform-note").waitFor();
    expect(
      await page.getByRole("heading", { name: "Примеры из проектов" }).count(),
    ).toBeTruthy();
    await go("projects");
    await page.locator("[data-action=project-practice]").click();
    await page.getByText(`1 из ${projectCount}`, { exact: true }).waitFor();
    expect(
      (await page.locator("#platformMain").innerText()).includes(
        `1 из ${projectCount}`,
      ),
    ).toBeTruthy();
    await page.locator("[data-action=reveal]").click();
    await page.locator("[data-rating=again]").click();
    await go("repeat");
    expect(await page.locator(".platform-list-row").count()).toBeTruthy();
    const before = await state();
    expect(before.questionProgress[markedId].status).toBe("done");
    // The complained-about card must explain TDZ itself and lead to the actual textbook.
    const tdzId =
      "ck:Собеседования/Темы/JavaScript#Что такое область видимости, hoisting и TDZ?";
    await page.goto(
      base + "/#" + new URLSearchParams({ view: "practice", question: tdzId }),
    );
    await page.locator("[data-action=reveal]").click();
    expect(await page.locator("#practiceCategory").inputValue()).toBe("route");
    expect(
      (await page.locator(".platform-answer").innerText()).includes(
        "временная мёртвая зона",
      ),
    ).toBeTruthy();
    await page
      .getByRole("heading", { name: "Проверьте себя", exact: true })
      .waitFor();
    const theory = page.getByRole("link", { name: /^Изучить тему:/ });
    const target = new URLSearchParams(
      (await theory.getAttribute("href"))!.split("?")[1] || "",
    );
    expect(target.get("note")!.startsWith("Фронтенд/JavaScript/")).toBeTruthy();
    await page.screenshot({
      path: "artifacts/platform-tdz.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: "artifacts/platform-tdz-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await theory.click();
    await page.locator(".platform-note").waitFor();
    expect(
      (await page.locator(".platform-note").innerText()).includes("TDZ"),
    ).toBeTruthy();
    await page.goto(
      base + "/#" + new URLSearchParams({ view: "practice", question: tdzId }),
    );
    await page.locator("[data-action=reveal]").click();
    await page.getByRole("link", { name: /^Решить задачу:/ }).click();
    await page.locator(".platform-note").waitFor();
    expect(
      new URLSearchParams(new URL(page.url()).hash.split("?")[1] || "").get(
        "heading",
      ) === "TDZ и затенение age",
    ).toBeTruthy();
    expect(await state()).toEqual(before);
    await expect(
      restoreProgressFixture(page, '{"version":3}'),
    ).rejects.toBeDefined();
    expect(await state()).toEqual(before);
    await page.evaluate(() =>
      localStorage.removeItem("project-map-platform-v3"),
    );
    await page.reload();
    await restoreProgressFixture(page, before);
    expect(await state()).toEqual(before);
    await go("interview");
    await page.locator("[data-action=full]:enabled").click();
    const full = required(Object.values((await state()).sessions).at(-1));
    expect(
      Object.values(full.snapshots).some((q) => q.kind === "design"),
    ).toBeTruthy();
    expect(
      Object.values(full.snapshots).some((q) => q.kind === "practice"),
    ).toBeTruthy();
    await page.clock.setSystemTime(new Date("2026-10-29T00:01:00+05:00"));
    await go("interview");
    await page.locator("[data-action=daily]").click();
    const tomorrow = (await state()).daily["2026-10-29"];
    expect(tomorrow).toBeTruthy();
    expect(tomorrow.questionIds).not.toEqual(first.questionIds);
    expect((await state()).daily["2026-10-28"]).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of [
      "interview",
      "practice",
      "themes",
      "repeat",
      "projects",
    ] as const) {
      await go(view);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `overflow: ${view}`,
      ).toBeTruthy();
    }
    await go("interview");
    await page.screenshot({
      path: "artifacts/platform-mobile.png",
      fullPage: true,
    });
    await page.route("**/api/knowledge", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      }),
    );
    await page.reload();
    await page
      .getByRole("status")
      .filter({ hasText: "База знаний временно недоступна" })
      .waitFor();
    await expect(page.locator("[data-action=daily]")).toBeEnabled();
    await page.locator("[data-action=daily]").click();
    await page.locator("[data-action=session-skip]").waitFor();
    await expect(page.locator(".question-card h2")).toHaveText(
      tomorrow.snapshots[tomorrow.questionIds[0]].title,
    );
    await go("projects");
    await page.locator("[data-action=project-practice]").click();
    await page.getByText(`1 из ${projectCount}`, { exact: true }).waitFor();
    expect(
      (await page.locator("#platformMain").innerText()).includes(
        `1 из ${projectCount}`,
      ),
    ).toBeTruthy();
    expect(Object.keys((await state()).daily).length).toBe(2);
    expect(errors).toEqual([]);
    console.log(
      "PASS platform browser: daily/full, optional followups, reload, local midnight, ratings, available route, internal links, shared progress, validated fixtures, keyboard, desktop/mobile, missing knowledge",
    );
  } catch (error) {
    await page.screenshot({
      path: "artifacts/platform-failure.png",
      fullPage: true,
    });
    console.error(
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 15)
          .map((e) => ({
            tag: e.tagName,
            class: e.className,
            width: e.getBoundingClientRect().width,
            text: e.textContent.slice(0, 80),
          })),
      ),
    );
    throw error;
  }
});
