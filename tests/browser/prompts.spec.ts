import { test, expect } from "#tests/helpers/browser.ts";
test.use({ appOptions: { projectPackageRoot: null } });
test("prompt editor saves all three overrides, previews exact context and restores the built-in version", async ({
  app: { base },
  page,
}) => {
  await page.goto(base + "/#/prompts");
  await expect(
    page.getByRole("heading", { name: "Промпты", exact: true }),
  ).toBeVisible();
  for (const title of [
    "Обсуждение материала",
    "Импорт и обновление базы",
    "Разбор проекта и опыта",
  ]) {
    await page.getByRole("button", { name: title, exact: true }).click();
    await page
      .getByLabel("Текст промпта", { exact: true })
      .fill(`Личный вариант: ${title}. Объясняй механизм на коротком примере.`);
    await page
      .getByRole("button", { name: "Сохранить промпт", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Промпт сохранён." }),
    ).toBeVisible();
  }
  await page.reload();
  await expect(page.getByLabel("Текст промпта", { exact: true })).toHaveValue(
    /Личный вариант: Обсуждение материала/,
  );
  await page
    .getByLabel("Вопрос или задача", { exact: true })
    .fill("Почему микрозадача выполняется раньше таймера?");
  await page
    .getByLabel("Дополнительный контекст", { exact: true })
    .fill("Нужен короткий пример для повторения.");
  const first = await page
    .locator("#promptMaterials option")
    .first()
    .getAttribute("value");
  expect(first).toBeTruthy();
  await page
    .getByLabel("Материалы для задания", { exact: true })
    .selectOption(first!);
  await page
    .getByRole("button", { name: "Показать итоговое задание", exact: true })
    .click();
  const composed = page.getByRole("region", {
    name: "Итоговое задание",
    exact: true,
  });
  await expect(composed).toContainText("Личный вариант: Обсуждение материала");
  await expect(composed).toContainText(
    "Почему микрозадача выполняется раньше таймера?",
  );
  await expect(composed).toContainText("Нужен короткий пример для повторения.");
  await expect(composed).toContainText(first!);
  await expect(composed).toContainText("КОНТРАКТ РЕЗУЛЬТАТА");
  await page
    .getByRole("button", { name: "Вернуть встроенный текст", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Восстановлен встроенный промпт." }),
  ).toBeVisible();
  await expect(page.getByLabel("Текст промпта", { exact: true })).toHaveValue(
    /Помоги пользователю разобраться/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/prompts/editor-mobile.png",
    fullPage: true,
  });
});
