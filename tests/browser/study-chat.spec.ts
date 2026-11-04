import { required } from "../helpers/values.ts";
import type { Knowledge } from "../../domain/knowledge/material.ts";
import { test, expect } from "../helpers/browser.ts";
import { mkdirSync } from "node:fs";
import { ownerAvailable } from "../helpers/owner-package.ts";
test.use({
  appOptions: {
    studyChatOptions: {
      answer: async ({ messages, onDelta, signal }) => {
        if (messages.at(-1)!.text === "Ошибка")
          throw Error("Проверочная ошибка Codex");
        if (messages.at(-1)!.text === "Останови") {
          onDelta("Частичный ответ");
          await new Promise((r) =>
            signal.addEventListener("abort", r, { once: true }),
          );
          throw Error("Остановлен");
        }
        const text =
          messages.length > 1
            ? "Продолжение обсуждения: предыдущий ответ сохранён."
            : "Promise представляет результат асинхронной операции. ".repeat(
                30,
              );
        onDelta(text);
        return text;
      },
    },
  },
});
test("study chat", async ({ app: { base }, page, pageErrors: errors }) => {
  mkdirSync("artifacts/study-chat", { recursive: true });

  const knowledge: Knowledge = await (
    await fetch(base + "/api/knowledge")
  ).json();
  const question = required(
    knowledge.questions.find(
      (q) => /Promise/.test(q.title) && q.kind === "theory",
    ),
  );
  expect(question).toBeTruthy();
  await page.goto(
    base + "/#/practice?question=" + encodeURIComponent(question.id),
  );
  await expect(
    page.getByRole("button", { name: "Разобраться с Codex", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Показать ответ", exact: true })
    .click();
  const launch = page.getByRole("button", {
    name: "Разобраться с Codex",
    exact: true,
  });
  await launch.focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Ваш вопрос или ответ" });
  await input.waitFor();
  await input.fill(
    "Объясни Promise одним предложением. Запомни учебное слово «маяк».",
  );
  await expect(
    page.getByRole("button", { name: "Отправить в ChatGPT", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Просмотреть задание", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Задание обсуждения", exact: true }),
  ).toContainText("Объясни Promise одним предложением");
  await page
    .getByRole("button", { name: "Отправить в ChatGPT", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".study-message.assistant pre")
        ?.textContent?.includes("Готовит ответ") === false,
    {},
    { timeout: 120000 },
  );
  await page
    .getByRole("button", { name: "Отправить в ChatGPT", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll(".study-chat button")).some(
        (b) => b.textContent === "Остановить",
      ),
    {},
    { timeout: 120000 },
  );
  const first = await page.locator(".study-message.assistant pre").innerText();
  expect(first.length > 10).toBeTruthy();
  await page.reload();
  await page
    .getByRole("button", { name: "Показать ответ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Разобраться с Codex", exact: true })
    .click();
  await input.waitFor();
  await expect(page.locator(".study-message.assistant pre").first()).toHaveText(
    first,
  );
  await input.fill(
    "Какое учебное слово я попросил запомнить? Ответь одним словом.",
  );
  await page
    .getByRole("button", { name: "Просмотреть задание", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Отправить в ChatGPT", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".study-message.assistant").length === 2 &&
      !Array.from(document.querySelectorAll(".study-chat button")).some(
        (b) => b.textContent === "Остановить",
      ),
    {},
    { timeout: 120000 },
  );
  {
    await input.fill("Ошибка");
    await page
      .getByRole("button", { name: "Просмотреть задание", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Отправить в ChatGPT", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Проверочная ошибка" })
      .waitFor();
    await input.fill("Останови");
    await page
      .getByRole("button", { name: "Просмотреть задание", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Отправить в ChatGPT", exact: true })
      .click();
    await page.getByRole("button", { name: "Остановить", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Запрос остановлен" })
      .waitFor();
  }
  await page.screenshot({
    path: "artifacts/study-chat/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/study-chat/mobile.png",
    fullPage: true,
  });
  await page.goto(base + "/#/interview");
  await page.locator("[data-action=full]").click();
  await page.locator(".question-card").waitFor();
  await expect(
    page.getByRole("button", { name: "Разобраться с Codex", exact: true }),
  ).toHaveCount(0);
  if (ownerAvailable) {
    await page.goto(base + "/#/projects?projectTopic=tr-local");
    await page
      .getByRole("button", { name: "Разобраться с Codex", exact: true })
      .click();
    await input.waitFor();
    await expect(page.locator(".study-message")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  console.log(
    `PASS ${"controlled Codex"}: keyboard, stream, reload, follow-up context, separate topics, mobile layout, full interview gating${", failure and cancel"}`,
  );
});
