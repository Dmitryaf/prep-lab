import { test as baseTest, expect } from "#tests/helpers/browser.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const test = baseTest.extend<{ projectDirectory: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency list.
  projectDirectory: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "prep-intensive-learning-"));
    const catalog = projectFixture();
    catalog.topics[0]!.pilot.code.steps[0]!.preview = {
      text: "const valid = validateInput(input);\nif (!valid) return;",
      startLine: 1,
    };
    try {
      await writeFile(
        join(directory, "projects.json"),
        JSON.stringify(catalog),
      );
      await use(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  appOptions: async ({ projectDirectory }, use) => {
    await use({
      projectPackageRoot: projectDirectory,
      knowledgeRoot: join(process.cwd(), "content/common"),
    });
  },
});

test("project intensive closes a specific gap, shows code and theory, saves a story and edits the program", async ({
  app: { base },
  page,
}) => {
  await page.goto(`${base}/#/intensive`);
  await page
    .getByLabel("Цель подготовки", { exact: true })
    .fill("Разобраться в своём проекте");
  await page.getByRole("checkbox", { name: /Первый пример/ }).check();
  await page
    .getByRole("button", { name: "Составить программу", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Начать подготовку", exact: true })
    .click();
  await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
    "Контракт операции",
  );
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Нужно разобраться", exact: true })
    .click();
  await page
    .getByLabel("В чём затруднение?", { exact: true })
    .fill("Не понимаю проверку входных данных");
  await expect(page.locator(".intensive-save-status")).toHaveText("Сохранено");
  await page
    .getByRole("button", { name: "Разобрать этот вопрос", exact: true })
    .click();
  await expect(page.locator(".intensive-focused-review")).toContainText(
    "Не понимаю проверку входных данных",
  );
  await page.getByText("Как это устроено в коде", { exact: true }).click();
  await page.getByText("Показать код", { exact: true }).click();
  await expect(page.locator(".code-preview pre")).toContainText(
    "validateInput",
  );
  await page
    .locator(".intensive-context > details > summary")
    .filter({ hasText: /^Связанные темы$/ })
    .click();
  await expect(page.locator(".intensive-context")).toContainText(
    "API, unknown",
  );
  await page
    .getByRole("button", {
      name: "Ответить ещё раз без подсказки",
      exact: true,
    })
    .click();
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Самостоятельно", exact: true })
    .click();
  await expect(page.locator(".intensive-save-status")).toHaveText("Сохранено");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Самостоятельно", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("checkbox", { name: "Нужно разобраться", exact: true })
    .check();
  await expect(
    page.getByText("Занятия не найдены.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Нужно разобраться", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Мой рассказ о проекте", exact: true })
    .click();
  await page
    .getByLabel("Для кого проект и какую задачу решает", { exact: true })
    .fill("Система принимает и сохраняет заявки.");
  await expect(
    page.getByRole("status").filter({ hasText: "Рассказ сохранён" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Прочитать целиком", exact: true })
    .click();
  await expect(page.locator(".intensive-story")).toContainText(
    "Система принимает и сохраняет заявки.",
  );
  await page
    .getByRole("button", { name: "Настроить программу", exact: true })
    .click();
  await page
    .getByLabel("Цель подготовки", { exact: true })
    .fill("Подготовка к новой вакансии");
  await page.getByRole("checkbox", { name: /Контракт операции/ }).uncheck();
  await page
    .getByRole("button", { name: "Сохранить программу", exact: true })
    .click();
  await expect(page.locator(".intensive-plan-heading")).toContainText(
    "Подготовка к новой вакансии",
  );
  await expect(page.locator(".intensive-queue button")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Настроить программу", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Контракт операции/ }).check();
  await page
    .getByRole("button", { name: "Сохранить программу", exact: true })
    .click();
  await page
    .locator(".intensive-queue")
    .getByRole("button", { name: /Контракт операции/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Самостоятельно", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Мой рассказ о проекте", exact: true })
    .click();
  await expect(
    page.getByLabel("Для кого проект и какую задачу решает", { exact: true }),
  ).toHaveValue("Система принимает и сохраняет заявки.");
  await page.route("**/api/intensive/story", (route) =>
    route.fulfill({ status: 503, json: { error: "Сервер недоступен" } }),
  );
  await page
    .getByLabel("Для кого проект и какую задачу решает", { exact: true })
    .fill("Несохранённое уточнение");
  await expect(
    page.getByText("Рассказ не сохранён", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".intensive-queue")
    .getByRole("button", { name: /Обработка ошибки/ })
    .click();
  await expect(
    page.getByLabel("Для кого проект и какую задачу решает", { exact: true }),
  ).toHaveValue("Несохранённое уточнение");
  await page.unroute("**/api/intensive/story");
  await page
    .getByRole("button", { name: "Повторить сохранение рассказа", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Рассказ сохранён" }),
  ).toBeVisible();
  await page
    .locator(".intensive-queue")
    .getByRole("button", { name: /Контракт операции/ })
    .click();
  await mkdir("artifacts/intensive-learning", { recursive: true });
  await page.screenshot({
    path: "artifacts/intensive-learning/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const navigation = page.locator(".intensive-navigation");
  await expect(navigation).not.toHaveAttribute("open", "");
  await navigation.locator(":scope > summary").click();
  await page.getByLabel("Найти занятие", { exact: true }).fill("ошибки");
  await page
    .locator(".intensive-queue")
    .getByRole("button", { name: /Обработка ошибки/ })
    .click();
  await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
    "Обработка ошибки",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/intensive-learning/mobile.png",
    fullPage: true,
  });
});
