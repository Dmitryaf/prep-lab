import { restoreProgressFixture } from "#tests/helpers/browser-progress.ts";
import type { Interview } from "#domain/interview/state.ts";
import { required } from "#tests/helpers/values.ts";
import { readProgress } from "#tests/helpers/browser-progress.ts";
import { test, expect } from "#tests/helpers/browser.ts";
import { mkdir } from "node:fs/promises";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { resolve } from "node:path";
import {
  loadState,
  createSession,
  storageKey,
} from "#domain/interview/engine.ts";

test.use({
  viewport: { width: 1440, height: 1100 },
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});
test("interview answers", async ({
  app: { base },
  context,
  page,
  pageErrors: errors,
}) => {
  const bank = loadCommonKnowledge();
  const id =
    "ck:Собеседования/Темы/JavaScript#Как работает цикл событий в браузере?";
  const current = bank.questions.find((q) => q.id === id);
  expect(current).toBeTruthy();
  if (!current) throw Error("Не найден вопрос Event Loop");
  // A legacy snapshot keeps the historical format; it must not be replaced from the live bank.
  const legacy = {
    ...current,
    shortAnswer: "Синхронный код выполняется до конца.",
    answer:
      "Синхронный код выполняется до конца.\n\n**Уточнения**\n\n- Почему таймер ждёт?\n\nПример: таймер выполняется после синхронного кода.",
    followups: ["Почему таймер ждёт?"],
    followupAnswers: [],
  };
  const daily: Interview = {
    ...createSession([legacy], "daily"),
    id: "daily:2026-11-03",
    date: "2026-11-03",
    reviewed: [id],
    ratings: { [id]: "partial" },
  };
  const initial = {
    ...loadState({ getItem: () => null }),
    daily: { [daily.date]: daily },
    activeSession: daily.id,
  };
  await context.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { key: storageKey, value: initial },
  );

  const state = () => readProgress(page);
  const visit = async (view: string, args: Record<string, string>) => {
    await page.goto(base + "/#/" + view + "?" + new URLSearchParams(args));
  };
  await mkdir("artifacts/interview-answers", { recursive: true });

  await visit("interview", { session: daily.id });
  await page.locator(".platform-answer").waitFor();
  let text = required(await page.locator(".question-card").textContent());
  expect(
    text.split(legacy.shortAnswer).length - 1,
    "legacy short answer appears only once",
  ).toBe(1);
  expect(
    text.split("Почему таймер ждёт?").length - 1,
    "followups appear only once",
  ).toBe(1);
  const supplement = page
    .locator(".platform-answer details")
    .filter({ has: page.locator("summary", { hasText: "Дополнительно" }) });
  await supplement.locator("summary").focus();
  await page.keyboard.press("Enter");
  expect(await supplement.getAttribute("open")).toBe("");
  expect(
    (await supplement.innerText()).includes("Пример: таймер"),
  ).toBeTruthy();
  const beforeReload = await state();
  expect(beforeReload.daily[daily.date]).toEqual(daily);
  await page.reload();
  await page.locator(".platform-answer").waitFor();
  expect(await state()).toEqual(beforeReload);
  await page.screenshot({
    path: "artifacts/interview-answers/legacy-desktop.png",
    fullPage: true,
  });

  await visit("practice", { question: id });
  await page.locator("[data-action=reveal]").click();
  const panel = page.locator(".platform-answer");
  text = await panel.innerText();
  expect(
    text.includes("Browser APIs") &&
      text.includes("Call Stack") &&
      text.includes("макрозадач"),
  ).toBeTruthy();
  await expect(
    panel.locator("pre"),
    "example visible in main answer",
  ).toHaveCount(1);
  await expect(
    panel.locator("details"),
    "no empty or repeated supplement",
  ).toHaveCount(0);
  expect(
    (await panel.innerText()).includes("Начало → Конец → Promise → Таймер"),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/interview-answers/event-loop-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/interview-answers/event-loop-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /^Изучить тему:/ })
    .first()
    .click();
  await page.locator(".platform-note").waitFor();
  await page.goBack();
  await page.locator("[data-action=reveal]").click();
  await page
    .getByRole("link", { name: /^Решить задачу:/ })
    .first()
    .click();
  await page.locator(".platform-note").waitFor();

  // Current content reaches new daily/full snapshots, with the existing reveal rules.
  for (const kind of ["daily", "full"] as const) {
    const session = createSession([current], kind);
    if (kind === "daily") session.id = `daily:${session.date}`;
    const value = {
      ...loadState({ getItem: () => null }),
      activeSession: session.id,
    };
    if (kind === "daily") value.daily[session.date] = session;
    else value.sessions[session.id] = session;
    await restoreProgressFixture(page, value);
    // A changed document query starts the app directly on the restored interview,
    // without racing the previous note's asynchronous anchor navigation.
    await page.goto(
      base +
        "/?answer-check=" +
        kind +
        "#/interview?" +
        new URLSearchParams({ session: session.id }),
    );
    await page.locator("[data-action=session-next]").waitFor();
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    {
      await page.locator("[data-action=session-review]").click();
      await page.locator(".platform-answer").waitFor();
      expect(
        (await page.locator(".platform-answer").innerText()).includes(
          "Browser APIs",
        ),
      ).toBeTruthy();
      const saved = await state();
      expect(
        (kind === "daily"
          ? saved.daily[session.date]
          : saved.sessions[session.id]
        ).snapshots[id],
        // A new session excludes unanswered draft followups before it is saved.
        // The historical snapshot must retain exactly that prepared question.
      ).toEqual(session.snapshots[id]);
    }
    await page.locator("[data-action=session-next]").click();
    await page
      .getByRole("heading", { name: "Разбор интервью", exact: true })
      .waitFor();
    expect(
      (await page.locator(".platform-answer").innerText()).includes(
        "Browser APIs",
      ),
    ).toBeTruthy();
    await expect(page.locator(".platform-answer pre")).toHaveCount(1);
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS answers: legacy snapshot unchanged, unique continuation, followups once, keyboard, Event Loop main example, desktop/mobile, study links, new daily/full reveal rules",
  );
});
