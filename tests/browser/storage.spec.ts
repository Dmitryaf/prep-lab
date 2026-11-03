import { test, expect } from "../helpers/browser.ts";
import { readProgress } from "../helpers/browser-progress.ts";
import { dailySession } from "../../domain/interview/selection.ts";
import { loadState, storageKey } from "../../domain/interview/saved-state.ts";

test("a corrupt browser record stays untouched and blocks automatic writes", async ({
  app: { base },
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "damaged original record"),
    storageKey,
  );
  await page.goto(base + "/#/interview");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#platformStatus")).toContainText(
    "Прежние данные браузера повреждены",
  );
  const before = await readProgress(page);
  await page.locator("[data-action=daily]").click();
  expect(await readProgress(page)).toEqual(before);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe("damaged original record");
});

test("SQLite migration preserves browser originals, old snapshots and writes from another tab", async ({
  app: { base },
  page,
  context,
}) => {
  const question = {
    id: "historical-question",
    title: "Историческая тема",
    prompt: "Прежний вопрос",
    answer: "Исторический ответ",
    kind: "theory",
    source: "knowledge",
    category: "JavaScript",
    followups: [],
    learningLinks: [],
    criteria: "",
  };
  const legacy = dailySession(
    loadState({ getItem: () => null }),
    [question],
    "2026-11-03",
  );
  legacy.questionProgress[question.id] = { status: "again" };
  legacy.questionProgress["retired-question"] = { status: "partial" };
  legacy.progress["retired-topic"] = { status: "done" };
  const original = JSON.stringify(legacy);
  await context.addInitScript(
    ({ key, original }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, original);
    },
    { key: storageKey, original },
  );
  const url =
    base + "/#/interview?session=" + encodeURIComponent("daily:2026-11-03");
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: question.title, exact: true }),
  ).toBeVisible();
  await page.locator("[data-action=session-review]").click();
  await expect(page.locator(".platform-answer")).toContainText(question.answer);
  await page.locator('[data-rating="done"]').click();
  expect((await readProgress(page)).questionProgress[question.id].status).toBe(
    "done",
  );
  await page.reload();
  const restored = await readProgress(page);
  expect(restored.questionProgress[question.id].status).toBe("done");
  expect(restored.questionProgress["retired-question"].status).toBe("partial");
  expect(restored.daily["2026-11-03"].snapshots[question.id].answer).toBe(
    question.answer,
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(original);

  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator(".platform-answer")).toBeVisible();
  let release!: () => void, intercepted!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const seen = new Promise<void>((done) => {
    intercepted = done;
  });
  await other.route("**/api/preparation", async (route) => {
    if (route.request().method() === "PUT") {
      intercepted();
      await gate;
    }
    await route.continue();
  });
  try {
    await other.locator('[data-rating="partial"]').click();
    await seen;
    await page.locator('[data-rating="again"]').click();
    expect(
      (await readProgress(page)).questionProgress[question.id].status,
    ).toBe("again");
    release();
    expect(
      (await readProgress(other)).questionProgress[question.id].status,
    ).toBe("again");
    await expect(other.locator("#platformStatus")).toContainText(
      "другой вкладке",
    );
  } finally {
    release();
    await other.close();
  }
  await page.route("**/api/preparation", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        json: { error: "Тестовый отказ записи: прежние данные сохранены." },
      });
    else await route.continue();
  });
  await page.locator('[data-rating="done"]').click();
  await expect(page.locator("#platformStatus")).toContainText(
    "Тестовый отказ записи",
  );
  expect((await readProgress(page)).questionProgress[question.id].status).toBe(
    "again",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(original);
});
