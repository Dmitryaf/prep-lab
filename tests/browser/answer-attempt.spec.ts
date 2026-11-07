import { resolve } from "node:path";
import { test, expect } from "#tests/helpers/browser.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "#tests/helpers/browser-progress.ts";
import { loadState } from "#domain/interview/saved-state.ts";
import { createSession } from "#domain/interview/selection.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
    studyChatOptions: {
      answer: async ({ context, onDelta }) => {
        const text = context.includes("HIDDEN_SOLUTION")
          ? "PREVIOUS_SOLUTION"
          : "Подумайте о входных данных.";
        onDelta(text);
        return text;
      },
    },
  },
});
const question = loadCommonKnowledge().questions.find(
  (q) => q.title === "Как работает цикл событий в браузере?",
)!;

test("practice hides answer fields and preserves historical attempts across navigation and reload", async ({
  app: { base },
  page,
}) => {
  await page.goto(
    base + "/#/practice?question=" + encodeURIComponent(question.id),
  );
  const state = await readProgress(page);
  state.practiceAttempts = {
    [question.id]: {
      text: "Прежний ответ",
      solutionUrl: "https://example.com/solution",
      updatedAt: "2026-11-01",
    },
  };
  await restoreProgressFixture(page, state);
  await page.reload();
  await expect(page.locator(".question-card h2")).toHaveText(question.title);
  await expect(
    page.getByRole("textbox", { name: "Моя попытка", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Ссылка на решение", exact: true }),
  ).toHaveCount(0);
  await page.locator("[data-action=next-question]").click();
  await page.locator("[data-action=previous-question]").click();
  await expect(page.locator(".question-card h2")).toHaveText(question.title);
  await page.reload();
  expect((await readProgress(page)).practiceAttempts).toEqual(
    state.practiceAttempts,
  );
});

test("full interview keeps historical attempts without displaying answer fields", async ({
  app: { base },
  page,
}) => {
  const second = { ...question, id: "attempt-second", title: "Второй вопрос" };
  const session = createSession([question, second], "full");
  session.attempts = {
    [question.id]: {
      text: "Прежний ответ интервью",
      solutionUrl: "",
      updatedAt: "2026-11-01",
    },
  };
  await page.goto(base + "/#/interview");
  await restoreProgressFixture(page, {
    ...loadState({ getItem: () => null }),
    sessions: { [session.id]: session },
    activeSession: session.id,
  });
  await page.goto(
    base + "/#/interview?session=" + encodeURIComponent(session.id),
  );
  await expect(page.locator(".question-card")).toHaveCount(1);
  await expect(page.locator(".answer-attempt")).toHaveCount(0);
  await page.locator("[data-action=session-next]").click();
  await page.locator("[data-action=session-next]").click();
  await expect(
    page.getByRole("heading", { name: "Разбор интервью", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".platform-answer")).toHaveCount(2);
  await expect(page.locator(".answer-attempt")).toHaveCount(0);
  await page.reload();
  expect((await readProgress(page)).sessions[session.id].attempts).toEqual(
    session.attempts,
  );
});

test("pre-reveal discussion excludes solutions and keeps prior revealed discussion in its original namespace", async ({
  app: { base },
  page,
}) => {
  const hiddenQuestion = {
    ...question,
    id: "hint-fixture",
    answer: "HIDDEN_SOLUTION",
    shortAnswer: "HIDDEN_SHORT",
    details: "HIDDEN_DETAILS",
    criteria: "HIDDEN_CRITERIA",
    followupAnswers: [{ title: "Почему?", answer: "HIDDEN_FOLLOWUP" }],
  };
  const session = createSession([hiddenQuestion], "full");
  const oldKey = "question:" + hiddenQuestion.id;
  const seed = await fetch(
    base + "/api/study-chat?key=" + encodeURIComponent(oldKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({
        message: "Старое обсуждение решения",
        context: "HIDDEN_SOLUTION",
      }),
    },
  );
  expect(seed.ok).toBeTruthy();
  await seed.text();
  await page.goto(base + "/#/interview");
  await restoreProgressFixture(page, {
    ...loadState({ getItem: () => null }),
    sessions: { [session.id]: session },
    activeSession: session.id,
  });
  await page.goto(
    base + "/#/interview?session=" + encodeURIComponent(session.id),
  );
  await page
    .getByRole("button", { name: "Разобраться с Codex", exact: true })
    .click();
  await expect(page.locator(".study-message")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Ваш вопрос или ответ" })
    .fill("Небольшая подсказка");
  await page
    .getByRole("button", { name: "Просмотреть задание", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Задание обсуждения",
    exact: true,
  });
  await expect(preview).toContainText(hiddenQuestion.title);
  await expect(preview).not.toContainText("HIDDEN_");
  await expect(preview).not.toContainText("PREVIOUS_SOLUTION");
  await expect(preview).toContainText("Дай одну наводящую подсказку");
  await expect(page.locator(".study-message")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Отправить в ChatGPT", exact: true })
    .click();
  await expect(page.locator(".study-message.assistant")).toContainText(
    "Подумайте о входных данных.",
  );
  await page.locator("[data-action=session-next]").click();
  await page
    .getByRole("button", { name: "Разобраться с Codex", exact: true })
    .click();
  await expect(page.locator(".study-message.assistant")).toContainText(
    "PREVIOUS_SOLUTION",
  );
  await expect(page.locator(".study-message.assistant")).not.toContainText(
    "Подумайте о входных данных.",
  );
  const repeated = { ...session, id: "full:another-attempt" };
  await restoreProgressFixture(page, {
    ...loadState({ getItem: () => null }),
    sessions: { [repeated.id]: repeated },
    activeSession: repeated.id,
  });
  await page.goto(
    base + "/#/interview?session=" + encodeURIComponent(repeated.id),
  );
  await page
    .getByRole("button", { name: "Разобраться с Codex", exact: true })
    .click();
  await expect(page.locator(".study-message")).toHaveCount(0);
});
