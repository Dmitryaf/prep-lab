import { test, expect } from "#tests/helpers/browser.ts";

test.use({ appOptions: { projectPackageRoot: null } });

function holdResponse() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}

test("manual source catalog waits, offers retry on failure and shows empty only after success", async ({
  app: { base },
  page,
}) => {
  const first = holdResponse();
  let attempts = 0;
  await page.route("**/api/sources", async (route) => {
    if (++attempts === 1) {
      await first.pending;
      await route.fulfill({
        status: 503,
        json: { error: "Источники временно недоступны." },
      });
      return;
    }
    await route.fulfill({
      json: { revision: 0, sources: [], roots: [], pending: [] },
    });
  });
  await page.goto(base + "/#/sources?mode=manual");
  const empty = page.getByText("Добавьте свои заметки:", { exact: false });
  try {
    await expect.poll(() => attempts).toBe(1);
    await expect(
      page.getByRole("status").filter({ hasText: "Загружаем источники" }),
    ).toBeVisible();
    await expect(empty).toBeHidden();
  } finally {
    first.release();
  }
  await expect(page.getByRole("alert")).toContainText(
    "Источники временно недоступны.",
  );
  await expect(empty).toBeHidden();
  await page
    .getByRole("button", { name: "Повторить загрузку источников" })
    .click();
  await expect(empty).toBeVisible();
  expect(attempts).toBe(2);
});

test("prompt editor retries its first load and retains the form during a failed refresh", async ({
  app: { base },
  page,
}) => {
  const first = holdResponse();
  const refresh = holdResponse();
  let attempts = 0;
  await page.route("**/api/prompts", async (route) => {
    attempts++;
    if (attempts === 2) {
      await route.continue();
      return;
    }
    await (attempts === 1 ? first.pending : refresh.pending);
    await route.fulfill({
      status: 503,
      json: { error: "Промпты временно недоступны." },
    });
  });
  await page.goto(base + "/#/prompts");
  const prompt = page.getByLabel("Текст промпта", { exact: true });
  try {
    await expect.poll(() => attempts).toBe(1);
    await expect(
      page.getByRole("status").filter({ hasText: "Загружаем промпты" }),
    ).toBeVisible();
    await expect(prompt).toBeHidden();
  } finally {
    first.release();
  }
  const error = page
    .getByRole("alert")
    .filter({ hasText: "Промпты временно недоступны." });
  await expect(error).toBeVisible();
  await page
    .getByRole("button", { name: "Повторить загрузку промптов" })
    .click();
  await expect(prompt).toBeVisible();
  await expect(error).toBeHidden();

  const context = page.getByLabel("Дополнительный контекст", { exact: true });
  await context.fill("Этот черновик остаётся при обновлении.");
  const original = await prompt.inputValue();
  await page.getByRole("button", { name: "Обновить версии" }).click();
  try {
    await expect.poll(() => attempts).toBe(3);
    await expect(
      page.getByRole("status").filter({ hasText: "Обновляем промпты" }),
    ).toBeVisible();
    await expect(prompt).toHaveValue(original);
    await expect(context).toHaveValue("Этот черновик остаётся при обновлении.");
  } finally {
    refresh.release();
  }
  await expect(error).toBeVisible();
  await expect(prompt).toHaveValue(original);
  await expect(context).toHaveValue("Этот черновик остаётся при обновлении.");
  expect(attempts).toBe(3);
});
