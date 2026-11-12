import { mkdir } from "node:fs/promises";
import { test, expect } from "#tests/helpers/browser.ts";
import type { IntensiveSnapshot } from "#domain/intensive/contracts.ts";

test.use({ appOptions: { projectPackageRoot: null } });

test("personal intensive uses imported analytics, preserves work and keeps tomorrow separate", async ({
  app: { base },
  page,
}) => {
  page.setDefaultTimeout(15_000);
  await mkdir("artifacts/intensive", { recursive: true });
  const theory = `---\nfrontendLab:\n  category: Аналитика\n  kind: theory\n---\n# Метрики продукта\n\n${Array.from({ length: 26 }, (_, index) => `## Как проверить метрику ${index + 1}?\n> [!answer]- Ответ\n> Сравните выборки и проверьте знаменатель ${index + 1}.\n`).join("\n")}`;
  const practice =
    "---\nfrontendLab:\n  category: Аналитика\n  kind: practice\n---\n# SQL для аналитика\n\n## Посчитайте число покупок\nДана таблица orders. Верните число покупок каждого клиента.\n\n> [!answer]- Ответ\n> ```sql\n> SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id;\n> ```\n";
  const reading =
    "---\nfrontendLab:\n  category: Аналитика\n  kind: reference\n---\n# Аналитические отчёты\n\nСравните периоды и проверьте полноту данных перед расчётом результата.\n";
  await page.goto(`${base}/#/sources`);
  await page
    .getByRole("link", { name: "Импорт готовых материалов", exact: true })
    .click();
  await page.getByLabel("Название источника").fill("Материалы аналитика");
  await page.getByLabel("Markdown или ZIP").setInputFiles([
    {
      name: "Метрики.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(theory),
    },
    {
      name: "SQL.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(practice),
    },
    {
      name: "Отчёты.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(reading),
    },
  ]);
  await page
    .getByRole("button", { name: "Подготовить изменения", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Принять изменения", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Материалы обновлены" }),
  ).toBeVisible();

  await page.goto(`${base}/#/intensive`);
  await page
    .getByLabel("Цель подготовки", { exact: true })
    .fill("Собеседование по аналитике");
  await page.getByLabel("Направление", { exact: true }).fill("Аналитика");
  await page.getByLabel("Найти тему", { exact: true }).fill("Аналитика");
  await page.getByRole("checkbox", { name: "Метрики продукта" }).check();
  await page.getByRole("checkbox", { name: "SQL для аналитика" }).check();
  await page.screenshot({
    path: "artifacts/intensive/setup.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Составить программу", exact: true })
    .click();
  await expect(
    page.getByText("Предпросмотр программы", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".intensive-program-list li")).toHaveCount(2);
  await expect(page.locator(".intensive-program-list")).toContainText(
    "26 вопросов",
  );
  const preview = (await (
    await page.request.get(`${base}/api/intensive`)
  ).json()) as IntensiveSnapshot;
  await page
    .getByRole("button", { name: "Изменить подборку", exact: true })
    .click();
  await page
    .getByText("Подобрать порядок занятий с ИИ", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Скопировать задание", exact: true })
    .click();
  await page.getByText("Задание для помощника", { exact: true }).click();
  await expect(
    page.getByLabel("Задание для помощника", { exact: true }),
  ).toHaveValue(/Собеседование по аналитике/);
  await page.getByLabel("Ответ помощника", { exact: true }).fill(
    JSON.stringify({
      lessonIds: preview.state.draft!.lessons.map((lesson) => lesson.id),
    }),
  );
  await page
    .getByRole("button", { name: "Посмотреть программу", exact: true })
    .click();
  await expect(page.locator(".intensive-program-list li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Убрать: SQL для аналитика", exact: true })
    .click();
  await page.getByText("Добавить занятия · 1", { exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить: SQL для аналитика", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Выше: SQL для аналитика", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/intensive/program.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Начать подготовку", exact: true })
    .click();
  await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
    "SQL для аналитика",
  );
  await expect(page.locator(".intensive-steps")).not.toContainText("Ответ");
  await page.getByRole("button", { name: "Практика", exact: true }).click();
  await expect(page.locator(".question-card h2")).toHaveText(
    "Посчитайте число покупок",
  );
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  await page
    .getByLabel("Ответ или решение", { exact: true })
    .fill("SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id;");
  await page
    .getByRole("button", { name: "Показать разбор ответа", exact: true })
    .click();
  await expect(page.locator(".platform-answer pre")).toBeVisible();
  await expect(page.locator(".intensive-save-status")).toHaveText("Сохранено");
  await page.reload();
  await expect(
    page.getByLabel("Ответ или решение", { exact: true }),
  ).toHaveValue(
    "SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id;",
  );
  await expect(
    page.getByRole("button", { name: "Практика", exact: true }),
  ).toHaveAttribute("aria-current", "step");

  await page.getByRole("button", { name: "Итог", exact: true }).click();
  await page
    .getByRole("radio", { name: "Применил в задаче", exact: true })
    .check();
  await page
    .getByLabel("Добавить вопрос на завтра", { exact: true })
    .fill("Повторить GROUP BY с NULL");
  await page
    .getByRole("button", { name: "Завершить занятие", exact: true })
    .click();
  await expect(
    page.getByText("Занятие завершено.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".intensive-tomorrow")).not.toHaveAttribute(
    "open",
    "",
  );
  await page
    .getByRole("button", { name: "Следующее занятие →", exact: true })
    .click();
  await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
    "Метрики продукта",
  );
  await expect(page.locator(".intensive-question-toolbar")).toContainText(
    "1 из 26",
  );
  await page.getByRole("button", { name: "Следующий вопрос занятия" }).click();
  await expect(page.locator(".question-card h2")).toHaveText(
    "Как проверить метрику 2?",
  );
  await expect(page.locator(".intensive-save-status")).toHaveText("Сохранено");
  await page.reload();
  await expect(page.locator(".question-card h2")).toHaveText(
    "Как проверить метрику 2?",
  );
  await page.getByRole("button", { name: "Предыдущий вопрос занятия" }).click();
  await expect(page.locator(".question-card h2")).toHaveText(
    "Как проверить метрику 1?",
  );

  await page
    .getByRole("button", { name: "Добавить материалы", exact: true })
    .click();
  await expect(page.getByLabel("Цель подготовки", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByLabel("Найти тему", { exact: true })
    .fill("Аналитические отчёты");
  await page
    .getByRole("checkbox", { name: "Аналитические отчёты", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Составить программу", exact: true })
    .click();
  await expect(page.locator(".intensive-program-list li")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Добавить в программу", exact: true })
    .click();
  const saved = (await (
    await page.request.get(`${base}/api/intensive`)
  ).json()) as IntensiveSnapshot;
  expect(saved.state.plan!.lessons).toHaveLength(3);
  expect(
    Object.values(saved.state.progress).some(
      (item) => item.status === "done" && item.outcome === "applied",
    ),
  ).toBe(true);
  expect(saved.state.tomorrow.map((item) => item.text)).toEqual([
    "Повторить GROUP BY с NULL",
  ]);
  await page
    .locator(".intensive-queue")
    .getByRole("button", { name: /Аналитические отчёты/ })
    .click();
  await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
    "Аналитические отчёты",
  );
  await page.reload();
  await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
    "Аналитические отчёты",
  );
  await page
    .locator(".intensive-queue")
    .getByRole("button", { name: /Метрики продукта/ })
    .click();
  await page.reload();
  await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
    "Метрики продукта",
  );
  await expect(page.locator(".intensive-tomorrow")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.locator(".intensive-tomorrow summary").click();
  await expect(
    page.getByRole("checkbox", { name: "Повторить GROUP BY с NULL" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Повторить GROUP BY с NULL" })
    .check();
  await mkdir("artifacts/intensive", { recursive: true });
  await page.screenshot({
    path: "artifacts/intensive/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/intensive/mobile.png",
    fullPage: true,
  });
  await page.route("**/api/intensive/progress", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Сервер временно недоступен." }),
    }),
  );
  await page
    .getByLabel("Ответ или решение", { exact: true })
    .fill("Мой ответ сохранится после восстановления связи.");
  await expect(page.locator(".intensive-save-status")).toHaveText(
    "Изменения не сохранены",
  );
  const dialogPromise = page.waitForEvent("dialog");
  const reload = page.reload().catch(() => undefined);
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await reload;
  await expect(
    page.getByLabel("Ответ или решение", { exact: true }),
  ).toHaveValue("Мой ответ сохранится после восстановления связи.");
  await page.unroute("**/api/intensive/progress");
  await page
    .getByRole("button", { name: "Повторить сохранение", exact: true })
    .click();
  await expect(page.locator(".intensive-save-status")).toHaveText("Сохранено");
  await page.reload();
  await expect(
    page.getByLabel("Ответ или решение", { exact: true }),
  ).toHaveValue("Мой ответ сохранится после восстановления связи.");
});
