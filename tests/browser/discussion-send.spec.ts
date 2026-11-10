import { resolve } from "node:path";
import type { Page, Request } from "@playwright/test";
import { test, expect } from "#tests/helpers/browser.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
    studyChatOptions: {
      answer: async ({ messages, onDelta }) => {
        const answer = `Ответ для: ${messages.at(-1)!.text}`;
        onDelta(answer);
        return answer;
      },
    },
  },
});

const previewUrl = /\/api\/study-chat\/preview\?/;
const sendUrl = /\/api\/study-chat\?/;
async function open(page: Page, base: string) {
  await page.goto(
    base +
      "/#/practice?" +
      new URLSearchParams({
        question:
          "ck:Собеседования/Темы/JavaScript#Как работает цикл событий в браузере?",
      }),
  );
  await page
    .getByRole("button", { name: "Обсудить с помощником", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Ваш вопрос или ответ" }),
  ).toBeEnabled();
}
function requests(page: Page) {
  const sent: Request[] = [],
    previews: Request[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/study-chat") sent.push(request);
    if (path === "/api/study-chat/preview") previews.push(request);
  });
  return { sent, previews };
}
const send = (page: Page) =>
  page.getByRole("button", { name: "Отправить", exact: true });
const input = (page: Page) =>
  page.getByRole("textbox", { name: "Ваш вопрос или ответ" });

test("direct send prepares the task once without a manual preview", async ({
  app: { base },
  page,
}) => {
  const calls = requests(page);
  await open(page, base);
  await expect(send(page)).toBeDisabled();
  await input(page).fill("Объясни порядок микрозадач");
  await expect(send(page)).toBeEnabled({ timeout: 1500 });
  await send(page).click();
  await expect(
    page.locator(".study-message.assistant .platform-markdown"),
  ).toHaveText("Ответ для: Объясни порядок микрозадач");
  expect(calls.previews).toHaveLength(1);
  expect(calls.sent).toHaveLength(1);
  expect(calls.sent[0]!.postDataJSON().expectedPrompt).toContain(
    "Объясни порядок микрозадач",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Обсудить с помощником", exact: true })
    .click();
  await expect(
    page.locator(".study-message.assistant .platform-markdown"),
  ).toHaveText("Ответ для: Объясни порядок микрозадач");
  await expect(send(page)).toBeDisabled();
});

test("manual preview remains optional and editing its message prepares a fresh task", async ({
  app: { base },
  page,
}) => {
  const calls = requests(page);
  await open(page, base);
  await input(page).fill("Первый вопрос");
  await page
    .getByRole("button", { name: "Просмотреть задание", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Задание обсуждения" }),
  ).toContainText("Первый вопрос");
  expect(calls.sent).toHaveLength(0);
  await send(page).click();
  await expect(
    page.locator(".study-message.assistant .platform-markdown"),
  ).toHaveText("Ответ для: Первый вопрос");
  expect(calls.previews).toHaveLength(1);
  await input(page).fill("Второй вопрос");
  await page
    .getByRole("button", { name: "Просмотреть задание", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Задание обсуждения" }),
  ).toContainText("Второй вопрос");
  await input(page).fill("Изменённый второй вопрос");
  await expect(
    page.getByRole("region", { name: "Задание обсуждения" }),
  ).toHaveCount(0);
  await expect(send(page)).toBeEnabled();
  await send(page).click();
  await expect(
    page.locator(".study-message.assistant .platform-markdown").last(),
  ).toHaveText("Ответ для: Изменённый второй вопрос");
  expect(calls.previews).toHaveLength(3);
  expect(calls.sent).toHaveLength(2);
  expect(calls.sent[1]!.postDataJSON().expectedPrompt).toContain(
    "Изменённый второй вопрос",
  );
});

test("a failed preparation keeps the draft and sends nothing until an explicit retry", async ({
  app: { base },
  page,
}) => {
  const calls = requests(page);
  await open(page, base);
  await page.route(previewUrl, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Не удалось подготовить задание." },
    }),
  );
  await input(page).fill("Мой вопрос");
  await expect(send(page)).toBeEnabled();
  await send(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось подготовить задание.",
  );
  await expect(input(page)).toHaveValue("Мой вопрос");
  await expect(page.locator(".study-message")).toHaveCount(0);
  expect(calls.sent).toHaveLength(0);
  await page.unroute(previewUrl);
  await send(page).click();
  await expect(
    page.locator(".study-message.assistant .platform-markdown"),
  ).toHaveText("Ответ для: Мой вопрос");
  expect(calls.sent).toHaveLength(1);
});

test("pending preparation blocks duplicate submits and discards a task after question navigation", async ({
  app: { base },
  page,
}) => {
  const calls = requests(page);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route(previewUrl, async (route) => {
    entered();
    await gate;
    await route.continue();
  });
  await open(page, base);
  await input(page).fill("Старый вопрос");
  await expect(send(page)).toBeEnabled();
  await page.locator(".study-chat form").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
    (form as HTMLFormElement).requestSubmit();
  });
  await started;
  await expect(send(page)).toBeDisabled();
  const previous = await page.locator(".question-card h2").innerText();
  await page.locator('[data-action="next-question"]').click();
  await expect(page.locator(".question-card h2")).not.toHaveText(previous);
  const response = page.waitForResponse(previewUrl);
  release();
  await response;
  await page.waitForLoadState("networkidle");
  expect(calls.previews).toHaveLength(1);
  expect(calls.sent).toHaveLength(0);
  await page.unroute(previewUrl);
  await page
    .getByRole("button", { name: "Обсудить с помощником", exact: true })
    .click();
  await expect(input(page)).toHaveValue("");
  await input(page).fill("Новый вопрос");
  await send(page).click();
  await expect(
    page.locator(".study-message.assistant .platform-markdown"),
  ).toHaveText("Ответ для: Новый вопрос");
  expect(calls.sent).toHaveLength(1);
  expect(JSON.parse(calls.sent[0]!.postDataJSON().context).title).toBe(
    await page.locator(".question-card h2").innerText(),
  );
});

test("editing a pending message keeps the new draft and discards the old task", async ({
  app: { base },
  page,
}) => {
  const calls = requests(page);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route(previewUrl, async (route) => {
    entered();
    await gate;
    await route.continue();
  });
  await open(page, base);
  await input(page).fill("Прежний текст");
  await send(page).click();
  await started;
  await input(page).fill("Новый текст");
  const response = page.waitForResponse(previewUrl);
  release();
  await response;
  await page.waitForLoadState("networkidle");
  expect(calls.sent).toHaveLength(0);
  await expect(input(page)).toHaveValue("Новый текст");
  await expect(send(page)).toBeEnabled();
  await page.unroute(previewUrl);
  await send(page).click();
  await expect(
    page.locator(".study-message.assistant .platform-markdown"),
  ).toHaveText("Ответ для: Новый текст");
  expect(calls.sent).toHaveLength(1);
});

test("a send conflict restores the message without an automatic resend", async ({
  app: { base },
  page,
}) => {
  const calls = requests(page);
  let reject = true;
  await page.route(sendUrl, (route) => {
    if (route.request().method() === "POST" && reject) {
      reject = false;
      return route.fulfill({
        status: 409,
        json: { error: "Задание изменилось. Повторите отправку." },
      });
    }
    return route.continue();
  });
  await open(page, base);
  await input(page).fill("Сохранить этот текст");
  await expect(send(page)).toBeEnabled();
  await send(page).click();
  await expect(page.getByRole("alert")).toContainText("Задание изменилось");
  await page.waitForLoadState("networkidle");
  expect(calls.sent).toHaveLength(1);
  await expect(input(page)).toHaveValue("Сохранить этот текст");
  await expect(page.locator(".study-message")).toHaveCount(0);
  await send(page).click();
  await expect(
    page.locator(".study-message.assistant .platform-markdown"),
  ).toHaveText("Ответ для: Сохранить этот текст");
  expect(calls.sent).toHaveLength(2);
  expect(calls.previews).toHaveLength(2);
});
