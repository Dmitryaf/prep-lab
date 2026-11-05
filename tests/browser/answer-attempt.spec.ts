import { resolve } from "node:path";
import { test, expect } from "../helpers/browser.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "../helpers/browser-progress.ts";
import { loadState } from "../../domain/interview/saved-state.ts";
import { createSession } from "../../domain/interview/selection.ts";
import { loadCommonKnowledge } from "../../server/infrastructure/knowledge/common.ts";

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

test("practice draft survives navigation, saving, reload, failed write and revision conflict", async ({
  app: { base },
  page,
}, testInfo) => {
  await page.goto(
    base + "/#/practice?question=" + encodeURIComponent(question.id),
  );
  const field = page.getByRole("textbox", { name: "Моя попытка", exact: true });
  await field.fill("Мой самостоятельный ответ");
  await page.locator("[data-action=next-question]").click();
  await expect(page).toHaveURL(/#\/practice$/);
  await expect(field).toHaveValue("");
  await page.goBack();
  await expect(field).toHaveValue("Мой самостоятельный ответ");
  await page
    .getByRole("textbox", { name: "Ссылка на решение", exact: true })
    .fill("https://example.com/my-solution");
  await page
    .getByRole("button", { name: "Сохранить попытку", exact: true })
    .click();
  await expect(page.locator(".answer-attempt")).toContainText(
    "Попытка сохранена",
  );
  expect((await readProgress(page)).practiceAttempts?.[question.id].text).toBe(
    "Мой самостоятельный ответ",
  );
  await page.reload();
  await expect(field).toHaveValue("Мой самостоятельный ответ");
  await expect(
    page.getByRole("textbox", { name: "Ссылка на решение", exact: true }),
  ).toHaveValue("https://example.com/my-solution");
  await page.locator("[data-action=reveal]").click();
  await expect(field).toHaveValue("Мой самостоятельный ответ");
  await expect(page.locator(".platform-answer")).toBeVisible();
  await page.route("**/api/preparation", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        json: { error: "Тестовый отказ записи" },
      });
    else await route.continue();
  });
  await field.fill("Не теряйте мой текст");
  await page
    .getByRole("button", { name: "Сохранить попытку", exact: true })
    .click();
  await expect(page.locator(".answer-attempt [role=alert]")).toContainText(
    "Тестовый отказ записи",
  );
  await expect(field).toHaveValue("Не теряйте мой текст");
  await page.unroute("**/api/preparation");
  let release!: () => void, seen!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const intercepted = new Promise<void>((r) => {
    seen = r;
  });
  await page.route("**/api/preparation", async (route) => {
    if (route.request().method() === "PUT") {
      seen();
      await gate;
    }
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Сохранить попытку", exact: true })
      .click();
    await intercepted;
    const before = await (await fetch(base + "/api/preparation")).json();
    const response = await fetch(base + "/api/preparation", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({
        state: {
          ...before.state,
          questionProgress: { other: { status: "partial" } },
        },
        expectedRevision: before.revision,
      }),
    });
    expect(response.ok).toBeTruthy();
    release();
    await expect(page.locator(".answer-attempt [role=alert]")).toContainText(
      "другой вкладке",
    );
    await expect(field).toHaveValue("Не теряйте мой текст");
  } finally {
    release();
    await page.unroute("**/api/preparation");
  }
  await page
    .getByRole("button", { name: "Сохранить попытку", exact: true })
    .click();
  await expect(page.locator(".answer-attempt")).toContainText(
    "Попытка сохранена",
  );
  const final = await readProgress(page);
  expect(final.practiceAttempts?.[question.id].text).toBe(
    "Не теряйте мой текст",
  );
  expect(final.questionProgress.other.status).toBe("partial");
  await expect(page.locator("#platformStatus")).not.toContainText(
    "другой вкладке",
  );
  await page.screenshot({
    path: testInfo.outputPath("attempt-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("attempt-mobile.png"),
    fullPage: true,
  });
});

test("full interview restores the attempt and shows it beside final answer without requiring every answer", async ({
  app: { base },
  page,
}) => {
  const second = { ...question, id: "attempt-second", title: "Второй вопрос" };
  const session = createSession([question, second], "full");
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
    .getByRole("textbox", { name: "Моя попытка", exact: true })
    .fill("Попытка только для этого интервью");
  await page
    .getByRole("button", { name: "Сохранить попытку", exact: true })
    .click();
  await expect(page.locator(".answer-attempt")).toContainText(
    "Попытка сохранена",
  );
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Моя попытка", exact: true }),
  ).toHaveValue("Попытка только для этого интервью");
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page.locator("[data-action=session-next]").click();
  await page.locator("[data-action=session-next]").click();
  await expect(
    page.getByRole("heading", { name: "Разбор интервью", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".platform-result").first()).toContainText(
    "Попытка только для этого интервью",
  );
  await expect(
    page.locator(".platform-result").first().locator(".platform-answer"),
  ).toBeVisible();
  expect(
    (await readProgress(page)).practiceAttempts?.[question.id],
  ).toBeUndefined();
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
