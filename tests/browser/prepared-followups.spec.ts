import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { test, expect } from "#tests/helpers/browser.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { createSession, loadState } from "#domain/interview/engine.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "#tests/helpers/browser-progress.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

test("prepared content opens its own answer and a renamed historical followup stays intact", async ({
  app: { base },
  page,
  pageErrors,
}) => {
  const current = loadCommonKnowledge().questions.find(
    (q) => q.title === "Как уменьшить размер сборки?",
  )!;
  const session = createSession([current], "full");
  const state = loadState({ getItem: () => null });
  state.sessions[session.id] = session;
  await page.goto(base);
  await restoreProgressFixture(page, state);
  await page.goto(
    `${base}/?prepared-followup=1#/interview?session=${encodeURIComponent(session.id)}`,
  );
  await page.locator('[data-action="session-followup"]').click();
  await expect(page.locator(".followup-question h3")).toBeVisible();
  // Followup order depends on the session seed; check the stage actually selected.
  const title = await page.locator(".followup-question h3").innerText();
  const selected = current.followupAnswers?.find(
    (item) => item.title === title,
  );
  expect(selected).toBeTruthy();
  const answer = selected!.answer.split("\n")[0];
  await expect(page.locator(".followup-question h3")).toHaveText(title);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page.locator('[data-action="followup-review"]').click();
  await expect(page.locator(".platform-answer")).toContainText(answer);
  await page.reload();
  // Reveal is local UI state; the selected stage and historical snapshot persist.
  await expect(page.locator(".followup-question h3")).toHaveText(title);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page.locator('[data-action="followup-review"]').click();
  await expect(page.locator(".platform-answer")).toContainText(answer);
  expect(
    (await readProgress(page)).sessions[session.id].snapshots[current.id],
  ).toEqual(session.snapshots[current.id]);
  await mkdir("artifacts/prepared-followups", { recursive: true });
  await page.screenshot({
    path: "artifacts/prepared-followups/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/prepared-followups/mobile.png",
    fullPage: true,
  });
  await page.locator('[data-action="session-previous"]').click();
  await expect(page.locator(".followup-question")).toHaveCount(0);
  await page.locator('[data-action="session-review"]').click();
  await expect(page.locator(".platform-answer")).not.toContainText(answer);

  const legacy = {
    ...current,
    answer: "Прежний основной ответ",
    shortAnswer: "",
    details: "",
    followups: ["динамический import"],
    followupAnswers: [],
  };
  const old = {
    ...createSession([current], "full"),
    id: "legacy-prepared-followup",
    snapshots: { [current.id]: legacy },
    followupIndex: 1,
    followupChoices: { [current.id]: [0] },
  };
  const historical = loadState({ getItem: () => null });
  historical.sessions[old.id] = old;
  await restoreProgressFixture(page, historical);
  await page.goto(`${base}/?prepared-followup=2#/interview?session=${old.id}`);
  await expect(page.locator(".followup-question h3")).toHaveText(
    "динамический import",
  );
  await expect(page.locator(".followup-question")).toContainText(
    "Отдельный разбор этого уточнения пока не добавлен",
  );
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  expect(
    (await readProgress(page)).sessions[old.id].snapshots[current.id],
  ).toEqual(legacy);
  expect(pageErrors).toEqual([]);
});

test("nested theory retains its identity and exposes all four new explanations in practice", async ({
  app: { base },
  page,
  pageErrors,
}) => {
  const question = loadCommonKnowledge().questions.find(
    (q) => q.title === "Что такое короткое замыкание логических операторов?",
  )!;
  expect(question.parentId).toBeTruthy();
  expect(createSession([question], "full").questionIds).toEqual([]);
  await page.goto(
    `${base}/#/practice?question=${encodeURIComponent(question.id)}`,
  );
  await expect(page.locator(".question-card h2")).toHaveText(question.title);
  await page.locator('[data-action="reveal"]').click();
  const details = page.locator(".answer-followups");
  await page.getByRole("tab", { name: /^Уточнения/ }).click();
  expect(question.followupAnswers).toHaveLength(4);
  for (const item of question.followupAnswers || []) {
    await expect(details).toContainText(item.title);
    await expect(details).toContainText(item.answer.split("\n")[0]!);
    await expect(page.locator(".platform-answer")).not.toContainText(
      item.answer.split("\n")[0]!,
    );
  }
  await mkdir("artifacts/prepared-followups", { recursive: true });
  await page.screenshot({
    path: "artifacts/prepared-followups/nested-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/prepared-followups/nested-mobile.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("prepared topic followups offer an independent answer through interview navigation", async ({
  app: { base },
  page,
  pageErrors,
}) => {
  const bank = loadCommonKnowledge();
  for (const parent of [
    "Как согласовать контракт между клиентом и сервером?",
    "Что тестировать в компоненте?",
    "От чего зависит this?",
    "Что делает Service Worker?",
    "Как проверять доступность интерфейса?",
    "Что TypeScript проверяет и чего не гарантирует?",
    "Зачем нужны обобщённые типы?",
    "Что гарантирует readonly?",
  ]) {
    const question = bank.questions.find((q) => q.title === parent)!;
    const session = createSession([question], "full");
    const state = loadState({ getItem: () => null });
    state.sessions[session.id] = session;
    await page.goto(base);
    await restoreProgressFixture(page, state);
    await page.goto(
      `${base}/?prepared-batch=2#/interview?session=${encodeURIComponent(session.id)}`,
    );
    await expect(page.locator(".question-card h2")).toHaveText(parent);
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    if (parent === "Как согласовать контракт между клиентом и сервером?") {
      await mkdir("artifacts/interview-review", { recursive: true });
      await page.screenshot({
        path: "artifacts/interview-review/main-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: "artifacts/interview-review/main-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.locator('[data-action="session-followup"]').click();
    await expect(page.locator(".followup-question h3")).toBeVisible();
    const title = await page.locator(".followup-question h3").innerText();
    const answer = question.followupAnswers?.find(
      (item) => item.title === title,
    )?.answer;
    expect(answer).toBeTruthy();
    await page.locator('[data-action="followup-review"]').click();
    await expect(page.locator(".platform-answer")).toContainText(
      answer!.split("\n")[0],
    );
    expect(
      (await readProgress(page)).sessions[session.id].snapshots[question.id],
    ).toEqual(session.snapshots[question.id]);
  }
  expect(pageErrors).toEqual([]);
});
