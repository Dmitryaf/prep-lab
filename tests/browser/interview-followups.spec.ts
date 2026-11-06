import { ownerAvailable } from "#tests/helpers/owner-package.ts";
import { required } from "#tests/helpers/values.ts";
import type { Progress } from "#domain/interview/state.ts";
import { readProgress } from "#tests/helpers/browser-progress.ts";
import { test, expect } from "#tests/helpers/browser.ts";
import { mkdir } from "node:fs/promises";
import { restoreProgressFixture } from "#tests/helpers/browser-progress.ts";

test("interview followups", async ({
  app: { base },
  page,
  pageErrors: errors,
}) => {
  test.skip(
    !ownerAvailable,
    "Совместимость личного пакета проверяется только при его наличии.",
  );
  const state = () => readProgress(page);
  const daily = (s: Progress) => s.daily["2026-10-28"];
  const restore = (value: unknown) => restoreProgressFixture(page, value);
  await mkdir("artifacts/optional-followups", { recursive: true });

  await page.clock.install({ time: new Date("2026-10-28T12:00:00+05:00") });
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Ежедневное интервью", exact: true })
    .waitFor();
  await page.locator("[data-action=daily]:enabled").click();
  await page
    .getByRole("heading", {
      level: 1,
      name: "Ежедневное интервью",
      exact: true,
    })
    .waitFor();
  await page.locator("[data-action=session-next]").waitFor();
  const original = await state(),
    url = page.url();
  expect(daily(original).questionIds.length).toBe(11);
  // Eleven main answers complete the daily interview without a single followup or skip.
  for (let i = 0; i < 11; i++) {
    expect(daily(await state()).index).toBe(i);
    await expect(page.locator("[data-action=session-next]")).toHaveText(
      i === 10 ? "Завершить интервью" : "Следующий вопрос",
    );
    await page.locator("[data-action=session-next]").click();
  }
  expect(daily(await state()).finished).toBeTruthy();
  expect(daily(await state()).skipped).toEqual([]);
  expect(daily(await state()).ratings).toEqual({});
  await expect(page.locator(".platform-answer")).toHaveCount(11);
  expect(
    (await page.getByText("Уточнения и разбор", { exact: true }).count()) > 0,
  ).toBeTruthy();
  // One optional followup: review, rate, study and back all preserve this exact prompt.
  await restore(original);
  await page.goto(url);
  await page.locator("[data-action=session-followup]").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-action=session-followup]")).toHaveCount(0);
  const prompt = await page.locator(".question-card h2").innerText();
  await page.locator("[data-action=session-review]").click();
  await page.locator("[data-rating=partial]").click();
  await expect(page.locator(".platform-answer h3")).toHaveText(
    "Разбор основной темы",
  );
  await page
    .getByRole("link", { name: /^Изучить тему:/ })
    .first()
    .click();
  await page.locator(".platform-note").waitFor();
  await page.locator("[data-action=back]").click();
  await page.waitForURL(url);
  await page.reload();
  await page.locator(".platform-answer").waitFor();
  await expect(page.locator(".question-card h2")).toHaveText(prompt);
  const saved = await state();
  await restore(saved);
  expect(await state()).toEqual(saved);
  const malformed = structuredClone(saved);
  daily(malformed).followupChoices = { missing: [0] };
  await expect(restore(malformed)).rejects.toBeDefined();
  expect(await state()).toEqual(saved);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/optional-followups/daily-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Следующий вопрос", exact: true })
    .click();
  expect(daily(await state()).index).toBe(1);
  expect(daily(await state()).skipped).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Full interview: two optional prompts only, no answers before completion.
  await page.goto(base);
  await page.locator("[data-action=full]:enabled").click();
  await page.locator("[data-action=session-next]").waitFor();
  const fullState = await state(),
    full = required(Object.values(fullState.sessions).at(-1)),
    fullURL = page.url();
  await page.locator("[data-action=session-followup]").click();
  await state();
  const one = await page.locator(".question-card h2").innerText();
  await page.locator("[data-action=session-followup]").click();
  await expect(page.locator("[data-action=session-followup]")).toHaveCount(0);
  const two = await page.locator(".question-card h2").innerText();
  expect(one).not.toBe(two);
  await page.reload();
  await page.locator("[data-action=session-next]").waitFor();
  await expect(page.locator(".question-card h2")).toHaveText(two);
  await expect(page.locator("[data-action=session-review]")).toHaveCount(0);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/optional-followups/full-desktop.png",
    fullPage: true,
  });
  for (let i = 0; i < 20; i++) {
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await page.locator("[data-action=session-next]").click();
  }
  await expect(page.locator(".platform-answer")).toHaveCount(20);
  expect((await state()).sessions[full.id].skipped).toEqual([]);
  // Legacy payloads retain an already-open third followup, even beyond the new cap.
  for (const kind of ["daily", "full"] as const) {
    const old = structuredClone(kind === "daily" ? original : fullState),
      s = kind === "daily" ? daily(old) : old.sessions[full.id];
    const index =
      kind === "full"
        ? s.questionIds.findIndex((id) => s.snapshots[id].project === "lanit")
        : 0;
    s.index = index;
    const id = s.questionIds[index],
      q = required(s.snapshots[id]);
    expect(q.followups!.length >= 3).toBeTruthy();
    s.followupIndex = 3;
    s.ratings[id] = "partial";
    delete s.followupChoices;
    if (kind === "full") {
      delete q.project;
      q.category = "Собственные проекты";
    }
    await restore(old);
    await page.goto(kind === "daily" ? url : fullURL);
    await page.locator("[data-action=session-next]").waitFor();
    await expect(page.locator(".question-card h2")).toHaveText(q.followups![2]);
    await expect(page.locator("[data-action=session-followup]")).toHaveCount(0);
    if (kind === "full")
      expect(
        (await page.locator(".platform-session-bar").innerText()).startsWith(
          "Коммерческий опыт",
        ),
      ).toBeTruthy();
    await page.locator("[data-action=session-next]").click();
    const after =
      kind === "daily"
        ? daily(await state())
        : (await state()).sessions[full.id];
    expect(after.index).toBe(index + 1);
    expect(after.ratings[id]).toBe("partial");
    expect(after.skipped).toEqual([]);
  }
  // Presentation changes apply in ordinary practice without changing question IDs.
  for (const project of ["lanit", "trajectory", "inbox"]) {
    const q = required(
      Object.values(full.snapshots).find((q) => q.project === project),
    );
    await page.goto(
      base + "/#" + new URLSearchParams({ view: "practice", question: q.id }),
    );
    await expect(page.locator(".question-card h2")).toHaveText(q.title);
    const meta = await page
      .locator(".question-card .platform-meta")
      .innerText();
    expect(
      meta.startsWith(
        project === "lanit" ? "Коммерческий опыт" : "Личный проект",
      ),
    ).toBeTruthy();
    expect(
      (await page.locator("#practiceCategory option:checked").innerText())
        .trim()
        .startsWith("Проекты и рабочий опыт"),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS daily11, optional daily1/full2, review/rating/study return, reload/validated fixtures, legacy third followups, project labels and mobile",
  );
});
