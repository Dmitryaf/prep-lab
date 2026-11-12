import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { test, expect } from "#tests/helpers/browser.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});
const note = loadCommonKnowledge().notes.find((item) =>
  item.title.includes("JavaScript"),
)!;

for (const [route, falseEmpty] of [
  [`/themes?note=${encodeURIComponent(note.id)}`, "Материал недоступен"],
  ["/practice", "По этому фильтру вопросов нет"],
  ["/repeat", "Вопросов для повторения пока нет"],
] as const) {
  test(`material request has a visible loading state without false empty on ${route}`, async ({
    app: { base },
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/knowledge", async (request) => {
      await gate;
      await request.continue();
    });
    try {
      await page.goto(`${base}/#${route}`);
      await expect(
        page
          .locator("#platformMain .loading-state")
          .filter({ hasText: "Загружаем материалы…" }),
      ).toBeVisible();
      await expect(page.getByText(falseEmpty, { exact: false })).toHaveCount(0);
      if (route.startsWith("/themes")) {
        await mkdir("artifacts/material-loading", { recursive: true });
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 844 });
          await page.screenshot({
            path: `artifacts/material-loading/${width}.png`,
          });
        }
      }
      release();
      await expect(page.locator("#platformMain .loading-state")).toHaveCount(0);
      if (route.startsWith("/themes"))
        await expect(page.locator(".platform-note")).toBeVisible();
      else if (route === "/practice")
        await expect(page.locator(".question-card")).toBeVisible();
      else
        await expect(
          page.getByRole("heading", { name: falseEmpty }),
        ).toBeVisible();
    } finally {
      release();
    }
  });
}

test("material failure offers retry and a failed request is not a missing note", async ({
  app: { base },
  page,
}) => {
  let calls = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/knowledge", async (request) => {
    calls++;
    if (calls === 1)
      await request.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Unavailable"}',
      });
    else {
      await gate;
      await request.continue();
    }
  });
  try {
    await page.goto(`${base}/#/themes?note=${encodeURIComponent(note.id)}`);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Не удалось загрузить материалы" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Материал недоступен" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Повторить загрузку материалов",
        exact: true,
      })
      .click();
    await expect(page.locator("#platformMain .loading-state")).toContainText(
      "Загружаем материалы",
    );
    await expect(
      page.getByRole("button", {
        name: "Повторить загрузку материалов",
        exact: true,
      }),
    ).toHaveCount(0);
    release();
    await expect(page.locator(".platform-note")).toBeVisible();
    expect(calls).toBe(2);
    await expect(page.locator("#platformMain .loading-state")).toHaveCount(0);
  } finally {
    release();
  }
});

test("initial instance loading is visible while the shell remains available", async ({
  app: { base },
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/preparation", async (request) => {
    await gate;
    await request.continue();
  });
  try {
    await page.goto(`${base}/#/practice`);
    await expect(page.locator("#platformMain .loading-state")).toContainText(
      "Загружаем данные экземпляра",
    );
    await expect(
      page.getByRole("navigation", { name: "Основные разделы" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Практика", exact: true }),
    ).toHaveCount(0);
    release();
    await expect(
      page.getByRole("heading", { name: "Практика", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".question-card")).toBeVisible();
  } finally {
    release();
  }
});
