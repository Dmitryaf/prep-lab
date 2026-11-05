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

test("the start page hides saved interviews without deleting them; direct links can still finish with write failures preserved", async ({
  app: { base },
  page,
}, testInfo) => {
  const bank = loadCommonKnowledge().questions;
  const full = createSession(bank, "full");
  const state = dailySession(
    loadState({ getItem: () => null }),
    bank,
    "2026-01-01",
  );
  state.sessions[full.id] = full;
  await page.goto(base + "/#/interview");
  await restoreProgressFixture(page, state);
  await expect(
    page.getByRole("heading", {
      name: /Незавершённые интервью|Завершённые интервью/,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".interview-pending-row")).toHaveCount(0);
  expect(await readProgress(page)).toEqual(state);
  await page.screenshot({
    path: testInfo.outputPath("interview-desktop.png"),
    fullPage: true,
  });
  await page.goto(base + "/#/interview?session=" + encodeURIComponent(full.id));
  await expect(page.locator('[data-action="session-finish"]')).toBeVisible();
  await page.route("**/api/preparation", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 503, json: { error: "Тестовый отказ" } });
    else await route.continue();
  });
  await page.locator('[data-action="session-finish"]').click();
  await expect(page.locator("#platformStatus")).toContainText("Тестовый отказ");
  expect((await readProgress(page)).sessions[full.id].finished).toBe(false);
  await page.unroute("**/api/preparation");
  await page.locator('[data-action="session-finish"]').click();
  await expect(
    page.getByRole("heading", { name: "Разбор интервью" }),
  ).toBeVisible();
  await page.reload();
  const saved = await readProgress(page);
  expect(saved.sessions[full.id].finished).toBe(true);
  expect(saved.daily).toEqual(state.daily);
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
