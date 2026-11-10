import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { test, expect } from "#tests/helpers/browser.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { createSession } from "#domain/interview/selection.ts";
import { loadState } from "#domain/interview/saved-state.ts";
import {
  restoreProgressFixture,
  readProgress,
} from "#tests/helpers/browser-progress.ts";

test.use({
  appOptions: {
    knowledgeRoot: resolve("content/common"),
    projectPackageRoot: null,
    studyChatOptions: {
      answer: async ({ onDelta }) => {
        const first =
          "Проверка данных:\n\n```ts\nconst product = { price: 100 };\n";
        onDelta(first);
        await new Promise((r) => setTimeout(r, 700));
        const rest =
          'console.log(product.price);\n```\n\n**Результат:** 100.\n\n<img src=x onerror="window.injected=true">';
        onDelta(rest);
        return first + rest;
      },
    },
  },
});

test("assistant renders streamed and stored code safely on a narrow screen", async ({
  app: { base },
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const question = loadCommonKnowledge().questions.find(
    (q) => q.title === "Как проверять данные внешнего API?",
  )!;
  await page.goto(
    base + "/#/practice?" + new URLSearchParams({ question: question.id }),
  );
  await page.locator("[data-action=reveal]").click();
  await page
    .getByRole("button", { name: "Обсудить с помощником", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Ваш вопрос или ответ" })
    .fill("Покажи пример");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  const message = page.locator(".study-message.assistant .platform-markdown");
  await expect(message.locator("pre code")).toContainText("const product");
  await expect(message.locator(".hljs-keyword")).toHaveText("const");
  await expect(message.locator("strong")).toHaveText("Результат:");
  await expect(message.locator("pre code")).toContainText("console.log");
  await expect(message.locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await mkdir("artifacts/interview-presentation", { recursive: true });
  await page.screenshot({
    path: "artifacts/interview-presentation/chat-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await page.locator("[data-action=reveal]").click();
  await page
    .getByRole("button", { name: "Обсудить с помощником", exact: true })
    .click();
  await expect(message.locator("pre code")).toContainText("console.log");
  await expect(message.locator(".hljs-keyword")).toHaveText("const");
});

for (const kind of ["daily", "full"] as const)
  test(`${kind}: followup has its own answer inside the main question and legacy snapshots stay intact`, async ({
    app: { base },
    page,
  }) => {
    const current = loadCommonKnowledge().questions.find(
      (q) => q.title === "Как устроена реактивность Vue 3?",
    )!;
    const session = createSession([current], kind);
    session.snapshots[current.id].followupAnswers = [];
    session.snapshots[current.id].answer = "Исторический основной ответ";
    session.snapshots[current.id].shortAnswer = "Исторический основной ответ";
    session.followupIndex = 2;
    session.followupChoices = { [current.id]: kind === "daily" ? [1] : [0, 1] };
    session.snapshots[current.id].learningLinks = current.learningLinks.filter(
      (link) => !link.noteId.includes("Proxy"),
    );
    session.reviewed = [current.id];
    const state = loadState({ getItem: () => null });
    if (kind === "daily") {
      session.id = "daily:" + session.date;
      state.daily[session.date] = session;
    } else state.sessions[session.id] = session;
    await page.goto(base);
    await restoreProgressFixture(page, state);
    const url =
      base + "/#/interview?" + new URLSearchParams({ session: session.id });
    await page.goto(url);
    await expect(page.locator(".question-card h2")).toHaveText(current.title);
    const stage = page.getByRole("region", { name: "Уточнение к вопросу" });
    await expect(stage.getByRole("heading", { level: 3 })).toHaveText(
      current.followups[1],
    );
    await expect(stage.locator(".platform-answer")).toHaveCount(0);
    const historyRequest = page.waitForRequest(
      (request) =>
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/study-chat",
    );
    await page
      .getByRole("button", { name: "Обсудить с помощником", exact: true })
      .click();
    expect(new URL((await historyRequest).url()).searchParams.get("key")).toBe(
      "interview-hint:" + JSON.stringify([session.id, current.id, 2]),
    );
    await page
      .getByRole("button", { name: "Свернуть обсуждение", exact: true })
      .click();
    await stage
      .getByRole("button", { name: "Показать ответ на уточнение" })
      .click();
    await expect(stage.locator(".platform-answer")).toContainText(
      "отдельный объект",
    );
    await expect(stage.locator(".platform-answer")).not.toContainText(
      "Исторический основной ответ",
    );
    const answerHistory = page.waitForRequest(
      (request) =>
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/study-chat",
    );
    await page
      .getByRole("button", { name: "Обсудить с помощником", exact: true })
      .click();
    expect(new URL((await answerHistory).url()).searchParams.get("key")).toBe(
      "question:" + JSON.stringify([current.id, current.followups[1]]),
    );
    await page
      .getByRole("button", { name: "Свернуть обсуждение", exact: true })
      .click();
    await stage.screenshot({
      path: `artifacts/interview-presentation/followup-${kind}-answer.png`,
    });
    await expect(page.locator("[data-action=session-review]")).toHaveCount(0);
    await expect(
      page.locator(".question-topics a").filter({ hasText: "Proxy и Reflect" }),
    ).toHaveCount(1);
    await page.locator("[data-action=session-previous]").click();
    await expect(stage).toHaveCount(0);
    await expect(page.locator(".platform-answer")).toContainText(
      "Исторический основной ответ",
    );
    await page.locator("[data-action=session-followup]").click();
    await expect(stage).toBeVisible();
    await stage
      .getByRole("button", { name: "Показать ответ на уточнение" })
      .click();
    await expect(stage.locator(".platform-answer")).toContainText(
      "отдельный объект",
    );
    await page.reload();
    await expect(stage).toBeVisible();
    await expect(stage.locator(".platform-answer")).toHaveCount(0);
    const saved = await readProgress(page);
    const stored =
      kind === "daily" ? saved.daily[session.date] : saved.sessions[session.id];
    expect(stored.snapshots).toEqual(session.snapshots);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/interview-presentation/followup-${kind}.png`,
      fullPage: true,
    });
  });

test("exercise hints start collapsed and the solution uses separate declarations", async ({
  app: { base },
  page,
}) => {
  const question = loadCommonKnowledge().questions.find(
    (q) => q.title === "Первый артикул остаётся при смене маршрута",
  )!;
  await page.goto(
    base + "/#/practice?" + new URLSearchParams({ question: question.id }),
  );
  const hint = page
    .locator(".question-card details")
    .filter({ has: page.locator("summary", { hasText: "Подсказка" }) });
  await expect(hint).toHaveCount(1);
  await expect(hint).not.toHaveAttribute("open");
  await expect(hint.locator("p")).toBeHidden();
  await hint.locator("summary").click();
  await expect(hint.locator("p")).toBeVisible();
  await page.locator("[data-action=reveal]").click();
  const code = await page.locator(".platform-answer pre").first().innerText();
  expect(code).toContain(
    "const article = ref(null);\nconst error = ref('');\nconst loading = ref(false);",
  );
});

test("an existing interview offers an answered clarification instead of an unfinished one", async ({
  app: { base },
  page,
}) => {
  const question = loadCommonKnowledge().questions.find(
    (q) => q.title === "Как устроена реактивность Vue 3?",
  )!;
  const session = createSession([question], "full");
  session.snapshots[question.id].followups = [
    "Уточнение без разбора",
    question.followups[1],
  ];
  session.snapshots[question.id].followupAnswers = [];
  const state = loadState({ getItem: () => null });
  state.sessions[session.id] = session;
  await page.goto(base);
  await restoreProgressFixture(page, state);
  await page.goto(
    base + "/#/interview?" + new URLSearchParams({ session: session.id }),
  );
  await page.locator("[data-action=session-followup]").click();
  await expect(page.locator(".followup-question h3")).toHaveText(
    question.followups[1],
  );
  await expect(page.locator("[data-action=session-followup]")).toHaveCount(0);
  expect(
    (await readProgress(page)).sessions[session.id].followupChoices?.[
      question.id
    ],
  ).toEqual([1]);
});
