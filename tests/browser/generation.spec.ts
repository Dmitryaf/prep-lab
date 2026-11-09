import { test, expect } from "#tests/helpers/browser.ts";
import { projectDraftFixture } from "#tests/fixtures/project-draft.ts";
test.use({
  appOptions: {
    projectPackageRoot: null,
    generationAnswer: async ({ onDelta }) => {
      const text = JSON.stringify(projectDraftFixture);
      for (let start = 0; start < text.length; start += 200)
        onDelta(text.slice(start, start + 200));
      return text;
    },
  },
});
test("generation requires visible exact task, supports structured review and preserves accepted project history", async ({
  app: { base },
  page,
}) => {
  await page.goto(base + "/#/generate");
  await expect(
    page.getByRole("heading", { name: "Подготовить материалы", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Сценарий", { exact: true }).selectOption("project");
  await page
    .getByLabel("Задача", { exact: true })
    .fill("Разобрать форму регистрации для собеседования.");
  await page
    .getByLabel("Рассказ о проекте и роли", { exact: true })
    .fill(
      "Работал над формой регистрации. Мои конкретные задачи нужно уточнить.",
    );
  await expect(
    page.getByRole("button", {
      name: "Подготовить черновик",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Показать задание перед отправкой",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Задание", exact: true }),
  ).toContainText("Работал над формой регистрации");
  await page
    .getByRole("button", {
      name: "Подготовить черновик",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Просмотр черновика", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Название проекта", { exact: true })
    .fill("Мой разбор формы");
  await page
    .getByRole("button", { name: "Принять черновик", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/projects/);
  const history = await (
    await page.request.get(base + "/api/generations")
  ).json();
  expect(history.jobs).toHaveLength(1);
  expect(history.jobs[0].status).toBe("accepted");
  await page.goto(base + "/#/generate");
  await page
    .getByRole("button", {
      name: /Открыть задание: Разобрать форму регистрации/,
    })
    .click();
  await expect(page.locator(".generation-current-status")).toHaveText(
    "Принято",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/generation/history-mobile.png",
    fullPage: true,
  });
});
