import { test, expect } from "#tests/helpers/browser.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "#tests/helpers/browser-progress.ts";
import { createSession } from "#domain/interview/selection.ts";
import type { Question } from "#domain/knowledge/question.ts";

test.use({ appOptions: { projectPackageRoot: null } });

test("free practice opens an optional stage without saving an attempt and keeps theory available", async ({
  app: { base },
  page,
}, info) => {
  const title = "Пакетная загрузка по ID с частичным кэшем";
  const id = "ck:Собеседования/Практика/Асинхронные контракты#" + title;
  await page.goto(base + "/#/practice?question=" + encodeURIComponent(id));
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Усложнение 1:/ }).click();
  await expect(page.locator(".question-card h2")).toHaveText(title);
  const stage = page.getByRole("region", { name: "Уточнение к вопросу" });
  await expect(
    stage.getByRole("heading", { name: "Кэш готовых значений", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Полезные темы" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("coding-practice-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "К основной задаче", exact: true })
    .click();
  await expect(page.locator(".question-card h2")).toHaveText(title);
  await expect(stage).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Моя попытка", exact: true }),
  ).toHaveCount(0);
});

test("optional coding stage keeps the saved attempt and hides both solutions until completion", async ({
  app: { base },
  page,
}, testInfo) => {
  await page.goto(base + "/#/interview");
  await expect(page.locator('[data-action="full"]')).toBeEnabled();
  const question: Question = {
    id: "coding-stage-fixture",
    title: "Список пользователей",
    prompt: "Покажите имена из массива users.",
    answer: "BASE_SOLUTION_MARKER",
    criteria: "BASE_CRITERION_MARKER",
    kind: "practice",
    source: "knowledge",
    category: "React",
    roundFormat: "coding",
    codingRole: "main",
    followups: ["Поиск по имени"],
    followupAnswers: [
      {
        title: "Поиск по имени",
        prompt:
          "Поиск по имени\n\nДобавьте поле query. Поиск не учитывает регистр; пустой запрос показывает весь список.",
        answer: "EXTENSION_SOLUTION_MARKER",
        criteria: "EXTENSION_CRITERION_MARKER",
      },
    ],
  };
  const state = await readProgress(page);
  const session = createSession([question], "full", {}, "react", "coding");
  session.attempts = {
    [question.id]: {
      text: "return users.map(user => user.name)",
      solutionUrl: "",
      updatedAt: "2026-11-01",
    },
  };
  state.sessions[session.id] = session;
  state.activeSession = session.id;
  await restoreProgressFixture(page, state);
  await page.goto(base + "/#/interview?session=" + session.id);
  await expect(
    page.getByRole("heading", { name: question.title, exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-action="session-followup"]')).toHaveText(
    "Усложнение 1: Поиск по имени",
  );
  await page.locator('[data-action="session-followup"]').click();
  await expect(page.getByText(/Поиск не учитывает регистр/)).toBeVisible();
  await expect(page.getByText(/SOLUTION_MARKER/)).toHaveCount(0);
  await expect(page.getByText(/CRITERION_MARKER/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Поиск не учитывает регистр/)).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Моя попытка", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("coding-stage-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator('[data-action="session-previous"]').click();
  await expect(
    page.getByRole("heading", { name: question.title, exact: true }),
  ).toBeVisible();
  await page.locator('[data-action="session-followup"]').click();
  await expect(page.getByText(/Поиск не учитывает регистр/)).toBeVisible();
  await page
    .getByRole("button", { name: "Пропустить усложнение", exact: true })
    .click();
  await expect(
    page.getByText("BASE_SOLUTION_MARKER", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("Дополнительные этапы и разбор", { exact: true })
    .click();
  await expect(
    page.getByText("EXTENSION_SOLUTION_MARKER", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("EXTENSION_CRITERION_MARKER", { exact: true }),
  ).toBeVisible();
  const done = (await readProgress(page)).sessions[session.id];
  expect(done.finished).toBe(true);
  expect(done.skipped).toEqual([]);
  expect(done.attempts?.[question.id].text).toBe(
    "return users.map(user => user.name)",
  );
});
