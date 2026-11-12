import type { Page } from "@playwright/test";
import type { IntensiveSnapshot } from "#domain/intensive/contracts.ts";
import type { IntensiveContext } from "#domain/intensive/context.ts";
import { test, expect } from "#tests/helpers/browser.ts";

test.use({ appOptions: { projectPackageRoot: null } });

const lessonIds = ["first", "second"];
const lessonTitles = ["Первое занятие", "Второе занятие"];
const snapshot: IntensiveSnapshot = {
  revision: 1,
  state: {
    version: 1,
    plan: {
      id: "loading-fixture",
      goal: { title: "Подготовка", noteIds: lessonIds, projectIds: [] },
      createdAt: "2026-01-01",
      lessons: lessonIds.map((id, index) => ({
        id,
        title: lessonTitles[index]!,
        kind: "material",
        noteId: id,
        reading: { title: lessonTitles[index]!, markdown: "Теория", href: "/" },
        questions: [
          {
            id: "question-" + id,
            title: "Как устроена загрузка?",
            prompt: "Как устроена загрузка?",
            answer: "Разбор загрузки",
            kind: "theory",
            source: "fixture",
            category: "Материалы",
            criteria: "Описание состояния",
            followups: [],
            learningLinks: [],
          },
        ],
      })),
    },
    draft: null,
    progress: {},
    tomorrow: [],
  },
};

const catalog = {
  notes: lessonIds.map((id, index) => ({
    id,
    title: lessonTitles[index],
    category: "Материалы",
    questionCount: 1,
  })),
  projects: [],
};

function context(id: string): IntensiveContext {
  return {
    code: [],
    map: { nodes: [], edges: [] },
    materials: [{ id, title: "Контекст " + id, markdown: "Теория", why: "" }],
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function openIntensive(page: Page, base: string) {
  await page.goto(base + "/#/intensive");
  await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
    "Первое занятие",
  );
}

test("refresh keeps the active lesson and its unsaved answer through errors and success", async ({
  app: { base },
  page,
}) => {
  let reads = 0;
  const delayedError = deferred();
  const delayedSuccess = deferred();
  const refreshed = structuredClone(snapshot);
  refreshed.revision++;
  refreshed.state.progress.first = {
    status: "in-progress",
    step: "answer",
    drafts: {},
    notes: "",
    updatedAt: "2026-01-02",
  };
  await page.route("**/api/intensive", async (route) => {
    if (++reads === 1) await route.fulfill({ json: snapshot });
    else if (reads === 2) {
      await delayedError.promise;
      await route.fulfill({
        status: 503,
        json: { error: "Данные недоступны" },
      });
    } else {
      await delayedSuccess.promise;
      await route.fulfill({ json: refreshed });
    }
  });
  await page.route("**/api/intensive/catalog", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route("**/api/intensive/context?*", (route) =>
    route.fulfill({ json: context("initial") }),
  );
  let saves = 0;
  await page.route("**/api/intensive/progress", (route) =>
    ++saves === 1
      ? route.fulfill({ json: snapshot })
      : route.fulfill({
          status: 503,
          json: { error: "Сохранение недоступно" },
        }),
  );
  await openIntensive(page, base);
  await page.getByRole("button", { name: /Второе занятие/ }).click();
  const title = page.locator(".intensive-lesson-header h2");
  await expect(title).toHaveText("Второе занятие");
  const answer = page.getByLabel("Ответ или решение", { exact: true });
  await answer.fill("Локальный черновик");
  await answer.press("Tab");
  const retry = page.getByRole("button", { name: "Обновить данные" });
  await expect(retry).toBeEnabled();
  const loader = page
    .getByRole("status")
    .filter({ hasText: "Обновляем программу" });
  try {
    await retry.click();
    await expect(title).toHaveText("Второе занятие", { timeout: 2000 });
    await expect(answer).toHaveValue("Локальный черновик");
    await expect(loader).toBeVisible();
    delayedError.resolve();
    await expect(
      page.getByText("Данные недоступны", { exact: true }),
    ).toBeVisible();
    await expect(answer).toHaveValue("Локальный черновик");
    await retry.click();
    await expect(loader).toBeVisible();
    delayedSuccess.resolve();
    await expect(loader).toHaveCount(0);
    await expect(title).toHaveText("Второе занятие");
    await expect(answer).toHaveValue("Локальный черновик");
  } finally {
    delayedError.resolve();
    delayedSuccess.resolve();
  }
});

test("adding materials reports a delayed catalog request and retries it in place", async ({
  app: { base },
  page,
}) => {
  await page.route("**/api/intensive", (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.route("**/api/intensive/context?*", (route) =>
    route.fulfill({ json: context("initial") }),
  );
  const delayedError = deferred();
  const delayedSuccess = deferred();
  let requests = 0;
  await page.route("**/api/intensive/catalog", async (route) => {
    if (++requests === 1) await route.fulfill({ json: catalog });
    else if (requests === 2) {
      await delayedError.promise;
      await route.fulfill({
        status: 503,
        json: { error: "Каталог недоступен" },
      });
    } else {
      await delayedSuccess.promise;
      await route.fulfill({ json: catalog });
    }
  });
  await openIntensive(page, base);
  const loader = page
    .getByRole("status")
    .filter({ hasText: "Загружаем список материалов" });
  try {
    await page.getByRole("button", { name: "Добавить материалы" }).click();
    await expect(loader).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
      "Первое занятие",
    );
    delayedError.resolve();
    await expect(
      page.getByText("Каталог недоступен", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Повторить загрузку списка" })
      .click();
    await expect(loader).toBeVisible();
    delayedSuccess.resolve();
    await expect(loader).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Дополнить программу", exact: true }),
    ).toBeVisible();
    expect(requests).toBe(3);
  } finally {
    delayedError.resolve();
    delayedSuccess.resolve();
  }
});

test("lesson context has its own loading and retry without showing a previous lesson's response", async ({
  app: { base },
  page,
}) => {
  await page.route("**/api/intensive", (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.route("**/api/intensive/catalog", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route("**/api/intensive/progress", (route) =>
    route.fulfill({ json: snapshot }),
  );
  const delayedFirst = deferred();
  const delayedSecond = deferred();
  let secondRequests = 0;
  await page.route("**/api/intensive/context?*", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("lessonId")!;
    if (id === "first") {
      await delayedFirst.promise;
      await route.fulfill({ json: context(id) });
    } else if (++secondRequests === 1) {
      await route.fulfill({ status: 503, json: { error: "Сбой контекста" } });
    } else {
      await delayedSecond.promise;
      await route.fulfill({ json: context(id) });
    }
  });
  const reveal = page.getByRole("button", { name: "Показать разбор ответа" });
  const loader = page
    .getByRole("status")
    .filter({ hasText: "Загружаем материалы занятия" });
  try {
    await openIntensive(page, base);
    await reveal.click();
    await expect(loader).toBeVisible({ timeout: 2000 });
    await page.getByRole("button", { name: /Второе занятие/ }).click();
    await expect(page.locator(".intensive-lesson-header h2")).toHaveText(
      "Второе занятие",
    );
    await reveal.click();
    await expect(
      page.getByText("Не удалось загрузить материалы занятия.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Повторить загрузку материалов" })
      .click();
    await expect(loader).toBeVisible();
    const previousResponse = page.waitForResponse(
      "**/api/intensive/context?lessonId=first",
    );
    delayedFirst.resolve();
    await previousResponse;
    await expect(loader).toBeVisible();
    await expect(page.getByText("Контекст first", { exact: true })).toHaveCount(
      0,
    );
    delayedSecond.resolve();
    await expect(loader).toHaveCount(0);
    await page.getByText("Связанные темы", { exact: true }).click();
    await expect(
      page.getByText("Контекст second", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Контекст first", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    delayedFirst.resolve();
    delayedSecond.resolve();
  }
});
