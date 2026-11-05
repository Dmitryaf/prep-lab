import { test, expect } from "../helpers/browser.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "../helpers/browser-progress.ts";
import {
  createSession,
  dailySession,
} from "../../domain/interview/selection.ts";
import { loadState } from "../../domain/interview/saved-state.ts";
import { loadCommonKnowledge } from "../../server/infrastructure/knowledge/common.ts";

test.use({ appOptions: { projectPackageRoot: null } });

test("unfinished daily and full sessions can be completed from the list, while failed writes keep the session active", async ({
  app: { base },
  page,
}, testInfo) => {
  const bank = loadCommonKnowledge().questions;
  const full = createSession(bank, "full");
  let state = dailySession(
    loadState({ getItem: () => null }),
    bank,
    "2026-01-01",
  );
  const daily = state.daily["2026-01-01"];
  state = { ...state, sessions: { [full.id]: full } };
  await page.goto(base + "/#/interview");
  await restoreProgressFixture(page, state);
  const rows = page.locator(".interview-pending-row");
  await expect(rows).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("interview-desktop.png"),
    fullPage: true,
  });
  await page.route("**/api/preparation", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 503, json: { error: "Тестовый отказ" } });
    else await route.continue();
  });
  await rows
    .first()
    .getByRole("button", { name: "Завершить", exact: true })
    .click();
  await expect(page.locator("#platformStatus")).toContainText("Тестовый отказ");
  await expect(rows).toHaveCount(2);
  expect((await readProgress(page)).daily["2026-01-01"].finished).toBe(false);
  await page.unroute("**/api/preparation");
  await rows
    .first()
    .getByRole("button", { name: "Завершить", exact: true })
    .click();
  await expect(rows).toHaveCount(1);
  await rows
    .first()
    .getByRole("button", { name: "Завершить", exact: true })
    .click();
  await expect(rows).toHaveCount(0);
  await page.reload();
  const saved = await readProgress(page);
  expect(saved.daily["2026-01-01"]).toMatchObject({
    ...daily,
    finished: true,
    index: daily.questionIds.length,
    followupIndex: 0,
  });
  expect(saved.sessions[full.id].finished).toBe(true);
  await expect(page.getByText(/Завершённые интервью/)).toHaveCount(0);
  await page.goto(base + "/#/interview?session=" + encodeURIComponent(full.id));
  await expect(
    page.getByRole("heading", { name: "Разбор интервью" }),
  ).toBeVisible();
});

test("early finish opens the review and keeps both saved and unsaved attempts", async ({
  app: { base },
  page,
}) => {
  await page.goto(base + "/#/interview");
  await page.locator("[data-action=full]:enabled").click();
  const field = page.getByRole("textbox", { name: "Моя попытка", exact: true });
  await field.fill("Сохранённый ответ");
  await page
    .getByRole("button", { name: "Сохранить попытку", exact: true })
    .click();
  await expect(page.locator(".answer-attempt")).toContainText(
    "Попытка сохранена",
  );
  await page.locator("[data-action=session-next]").click();
  await field.fill("Черновик второго ответа");
  await page
    .getByRole("button", { name: "Завершить интервью", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Разбор интервью" }),
  ).toBeVisible();
  await expect(page.locator(".platform-result").nth(1)).toContainText(
    "Черновик второго ответа",
  );
  await page
    .getByRole("button", { name: "Сохранить попытку", exact: true })
    .click();
  await expect(page.locator(".platform-result").nth(1)).toContainText(
    "Попытка сохранена",
  );
  await page.reload();
  await expect(page.locator(".platform-result").first()).toContainText(
    "Сохранённый ответ",
  );
  await expect(page.locator(".platform-result").nth(1)).toContainText(
    "Черновик второго ответа",
  );
});
