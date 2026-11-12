import { ownerAvailable, ownerCatalog } from "#tests/helpers/owner-package.ts";
import { required } from "#tests/helpers/values.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";
import type { Progress } from "#domain/interview/state.ts";
import { readProgress } from "#tests/helpers/browser-progress.ts";
import { test, expect } from "#tests/helpers/browser.ts";
import { expectCompactReview } from "#tests/helpers/interview-review.ts";
import { mkdir } from "node:fs/promises";

test("interview flow", async ({ app: { base }, page, pageErrors: errors }) => {
  test.skip(
    !ownerAvailable,
    "Совместимость личного пакета проверяется только при его наличии.",
  );
  const state = () => readProgress(page);
  const current = (s: Progress) => s.daily[Object.keys(s.daily).at(-1)!];
  await mkdir("artifacts/interview-fixes", { recursive: true });

  await page.goto(base);
  await page.locator("[data-action=daily]:enabled").click();
  await page.locator("[data-action=session-review]").waitFor();
  const first = current(await state()),
    id = first.questionIds[0],
    url = page.url();
  expect(first.questionIds.length).toBe(11);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  // A: answer -> review -> rate -> study -> back -> reload, same question and selection.
  await page.locator("[data-action=session-review]").click();
  await page.locator("[data-rating=partial]").click();
  await page
    .getByRole("link", { name: /^Изучить тему:/ })
    .first()
    .click();
  await page.locator(".platform-note").waitFor();
  await page.locator("[data-action=back]").click();
  await page.waitForURL(url);
  await page.locator(".platform-answer").waitFor();
  await page.reload();
  await page.locator(".platform-answer").waitFor();
  expect(current(await state()).questionIds).toEqual(first.questionIds);
  expect(current(await state()).index).toBe(0);
  expect((await state()).questionProgress[id].status).toBe("partial");
  // Reach a project, open its source map and inspect actual code references in the native project view.
  const projectIndex = first.questionIds.findIndex(
    (id) =>
      first.snapshots[id].kind === "project" &&
      !!ownerCatalog.repositories[first.snapshots[id].project || ""],
  );
  for (let i = 0; i < projectIndex; i++)
    await page.locator("[data-action=session-skip]").click();
  await page.locator("[data-action=session-review]").click();
  await page.locator("[data-rating=again]").click();
  const projectId = first.questionIds[projectIndex];
  await page
    .getByRole("link", { name: "Проект и реализация в коде", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(0);
  const frame = page;
  await frame.locator("[data-action=back-to-topics]").waitFor();
  expect(
    (await frame.locator("body").innerText()).includes("Реализация"),
  ).toBeTruthy();
  const code = frame.locator(".code-step a").first();
  await code.scrollIntoViewIfNeeded();
  await expect(code).toBeVisible();
  expect(await code.getAttribute("href")).toMatch(
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/blob\/[a-f0-9]+\/.+#L\d+/,
  );
  await page.screenshot({
    path: "artifacts/interview-fixes/project-code.png",
    fullPage: true,
  });
  // B: project gap opens the same answer, theory and code; marks persist.
  await page.locator('#platformNav a[href="#/repeat"]').click();
  await page
    .locator(".platform-list-row")
    .filter({ hasText: first.snapshots[projectId].title })
    .click();
  await page.locator("[data-action=reveal]").click();
  expect(
    await page
      .getByRole("link", { name: "Проект и реализация в коде", exact: true })
      .count(),
  ).toBeTruthy();
  await page.locator("[data-rating=done]").click();
  await page.reload();
  await page.locator("[data-action=reveal]").waitFor();
  expect((await state()).questionProgress[projectId].status).toBe("done");
  // Historical Javascript/Typescript routes resolve, including old exported snapshot links.
  const bank: Knowledge = await (await fetch(base + "/api/knowledge")).json();
  for (const section of ["JavaScript", "TypeScript"]) {
    const note = required(
      bank.notes.find((n) => n.id.startsWith(`Фронтенд/${section}/`)),
    );
    const legacy = note.id.replace(
      section,
      section === "JavaScript" ? "Javascript" : "Typescript",
    );
    await page.goto(
      base + "/#" + new URLSearchParams({ view: "themes", note: legacy }),
    );
    await page.locator(".platform-note").waitFor();
    await expect(page.locator(".platform-note .platform-meta")).toContainText(
      section,
    );
  }
  // C: full interview has all requested groups; answers stay hidden until explicitly opened or the interview finishes.
  await page.goto(base);
  await page.locator("[data-action=full]:enabled").click();
  await page.locator("[data-action=session-next]").waitFor();
  const full = required(Object.values((await state()).sessions).at(-1)),
    qs = Object.values(full.snapshots);
  expect(qs.length).toBe(20);
  for (const p of ["trajectory", "inbox", "lanit"])
    expect(qs.some((q) => q.project === p)).toBeTruthy();
  expect(qs.some((q) => q.kind === "behavioral")).toBeTruthy();
  expect(
    new Set(
      qs
        .filter((question) => question.kind === "project")
        .map((question) => question.projectGroup),
    ).size,
  ).toBeGreaterThanOrEqual(2);
  await expect(page.locator("[data-action=session-review]")).toBeVisible();
  let steps = 0;
  while (await page.locator("[data-action=session-next]").count()) {
    expect(++steps <= 20).toBeTruthy();
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await page.locator("[data-action=session-next]").click();
    if (steps === 5) {
      await page.reload();
      await page.locator("[data-action=session-next]").waitFor();
    }
  }
  expect(steps).toBe(20);
  await expectCompactReview(
    page,
    Object.values((await state()).sessions).at(-1)!,
  );
  await page.locator("[data-rating=again]").last().click();
  expect(Object.values((await state()).sessions).at(-1)!.finished).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/interview-fixes/full-review-mobile.png",
    fullPage: true,
  });
  await page.goto(url);
  await page.locator("[data-action=session-next]").waitFor();
  expect(current(await state()).index).toBe(projectIndex);
  await page.screenshot({
    path: "artifacts/interview-fixes/daily-review-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  // Free practice keeps its position when searching and when returning from theory.
  await page.goto(base + "/#/practice");
  await page.locator("#practiceCategory").selectOption("route");
  await page.locator("[data-action=next-question]").click();
  await page.locator("[data-action=next-question]").click();
  const practiceTitle = await page.locator(".question-card h2").innerText();
  await page.locator("[data-action=reveal]").click();
  await page
    .getByRole("link", { name: /^Изучить тему:/ })
    .first()
    .click();
  await page.locator(".platform-note").waitFor();
  await page.locator("[data-action=back]").click();
  await page.locator(".question-card").waitFor();
  await expect(page.locator(".question-card h2")).toHaveText(practiceTitle);
  await page.getByRole("button", { name: "Найти материал" }).click();
  await page.locator("#platformSearch").fill("IndexedDB");
  await page.keyboard.press("Escape");
  await expect(page.locator(".question-card h2")).toHaveText(practiceTitle);
  expect(errors).toEqual([]);
  console.log(
    "PASS daily review/study/return/reload, project code and repeat, legacy paths, full20 without required followups and persisted ratings, mobile",
  );
});
