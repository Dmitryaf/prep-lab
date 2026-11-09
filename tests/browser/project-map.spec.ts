import { test as baseTest, expect } from "#tests/helpers/browser.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const test = baseTest.extend<{ projectDirectory: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency list.
  projectDirectory: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "frontend-lab-map-"));
    const catalog = projectFixture();
    catalog.topics[0].mechanism.push(
      "TypeScript описывает поля входных данных формы.",
    );
    catalog.projects.second.map = {
      nodes: [
        {
          id: "save",
          label: "Сохранение результата",
          description: "Проверить данные и записать результат.",
          kind: "scenario",
          topicIds: ["second-main"],
        },
        {
          id: "storage",
          label: "Хранилище",
          description: "Сохраняет результат операции.",
          kind: "module",
          topicIds: ["second-storage"],
        },
        {
          id: "typescript",
          label: "TypeScript",
          description: "Типы входных данных хранилища.",
          kind: "technology",
          topicIds: ["second-storage"],
        },
      ],
      edges: [
        {
          from: "save",
          to: "storage",
          label: "Передаёт результат",
          kind: "flow",
        },
        {
          from: "storage",
          to: "typescript",
          label: "Описывает типы через",
          kind: "uses",
        },
      ],
    };
    catalog.projects.second.structure = {
      nodes: [
        "Ввод данных",
        "Хранение",
        "Синхронизация",
        "Аккаунт",
        "Общий интерфейс",
        "Обновления",
      ].map((label, index) => ({
        id: `block:${index}`,
        label,
        kind: "module" as const,
        description: `${label}: ответственность и основные части.`,
        topicIds: [index === 0 ? "second-main" : "second-storage"],
      })),
      edges: [
        {
          from: "block:0",
          to: "block:1",
          kind: "flow",
          label: "Сохраняет запись",
        },
      ],
    };
    await writeFile(join(directory, "projects.json"), JSON.stringify(catalog));
    try {
      await use(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  appOptions: async ({ projectDirectory }, use) => {
    await use({ projectPackageRoot: projectDirectory });
  },
});

test("project map opens by default, reveals scenarios and retains map context after reading", async ({
  app: { base },
  page,
}, info) => {
  await page.goto(base + "/#/projects");
  const map = page.getByRole("region", { name: "Визуальная карта проекта" });
  await expect(map).toBeVisible();
  await expect(page.locator('[data-mode="overview"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('[data-map-node="topic:first-main"]').click();
  await expect(
    page.getByRole("complementary", { name: "Выбранный элемент карты" }),
  ).toContainText("Проверяемый учебный пример с явными границами.");
  await page
    .getByRole("link", { name: "Открыть разбор", exact: false })
    .click();
  await expect(page.locator(".topic-title")).toHaveText("Контракт операции");
  await page.reload();
  await page
    .getByRole("button", { name: "← К карте проекта", exact: true })
    .click();
  await expect(
    page.locator('[data-map-node="topic:first-main"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("navigation", { name: "Представление карты" })
    .getByRole("button", { name: "Устройство", exact: true })
    .click();
  await expect(page.locator(".project-map .node-system")).toHaveCount(0);
  await page.locator('[data-map-node="module:Сценарии"]').click();
  await page.getByRole("tab", { name: "Материалы", exact: true }).click();
  await expect(page.locator(".project-map-code")).not.toHaveAttribute("open");
  await page.locator(".project-map-code summary").click();
  await expect(page.locator(".project-map-code")).toContainText(
    "src/example.ts:1",
  );
  await page
    .getByRole("navigation", { name: "Представление карты" })
    .getByRole("button", { name: "Технологии", exact: true })
    .click();
  await page.locator('[data-map-node="technology:TypeScript"]').click();
  await expect(
    page.getByRole("complementary", { name: "Выбранный элемент карты" }),
  ).toContainText("TypeScript описывает поля входных данных формы.");
  await page.screenshot({
    path: info.outputPath("project-map-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("project-map-mobile.png"),
    fullPage: true,
  });
});

test("map clicks preserve the page, canvas position and existing node coordinates", async ({
  app: { base },
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(base + "/#/projects");
    const group = page.locator('[data-map-node="topic:first-main"]');
    await group.waitFor();
    await group.scrollIntoViewIfNeeded();
    await page.evaluate(() => scrollBy(0, 80));
    const measure = () =>
      page.evaluate(() => {
        const viewport = document.querySelector(".map-overview")!;
        const node = document.querySelector(
          '[data-map-node="topic:first-main"]',
        )!;
        return {
          pageY: scrollY,
          x: viewport.scrollLeft,
          y: viewport.scrollTop,
          width: viewport.clientWidth,
          top: (node as HTMLElement).offsetTop,
        };
      });
    const before = await measure();
    await group.click();
    await expect(group).toHaveAttribute("aria-pressed", "true");
    await expect.poll(measure).toEqual(before);
    await page
      .getByRole("button", { name: "Закрыть сведения", exact: true })
      .click();
    const views = page.getByRole("navigation", { name: "Представление карты" });
    for (const name of ["Устройство", "Технологии", "Сценарии"]) {
      const button = views.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      const y = await page.evaluate(() => scrollY);
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
    }
  }
});

test("authored project map displays explicit technology relationships and opens linked explanations", async ({
  app: { base },
  page,
}) => {
  await page.goto(base + "/#/projects?project=second&mapView=technologies");
  await page.locator('[data-map-node="typescript"]').click();
  const detail = page.getByRole("complementary", {
    name: "Выбранный элемент карты",
  });
  await expect(detail).toContainText("Типы входных данных хранилища.");
  await detail.getByRole("tab", { name: "Связи", exact: true }).click();
  await expect(detail).toContainText("Описывает типы через");
  await detail.getByRole("button", { name: /^Хранилище/ }).click();
  await detail
    .getByRole("link", { name: "Открыть разбор", exact: false })
    .click();
  await expect(page.locator(".topic-title")).toHaveText("Хранение результата");
});

test("structure opens six responsibility blocks and reveals relationships and code on demand", async ({
  app: { base },
  page,
}, info) => {
  await page.goto(base + "/#/projects?project=second&mapView=structure");
  await expect(page.locator(".project-map .node-module")).toHaveCount(6);
  await expect(page.locator(".project-map .node-scenario")).toHaveCount(0);
  await expect(page.locator(".project-map .node-technology")).toHaveCount(0);
  await page.locator('[data-map-node="block:0"]').click();
  const panel = page.getByRole("complementary", {
    name: "Выбранный элемент карты",
  });
  await expect(panel).toContainText("Ввод данных: ответственность");
  await panel.getByRole("tab", { name: "Связи", exact: true }).click();
  await expect(panel).toContainText("Сохраняет запись");
  await panel.getByRole("button", { name: /^Хранение/ }).click();
  await expect(page.locator('[data-map-node="block:1"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await panel.getByRole("tab", { name: "Материалы", exact: true }).click();
  await expect(panel.locator(".project-map-code")).not.toHaveAttribute("open");
  await panel.locator(".project-map-code summary").click();
  await expect(panel.locator(".project-map-code")).toContainText(
    "src/example.ts:1",
  );
  await page.screenshot({
    path: info.outputPath("structure-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("structure-mobile.png"),
    fullPage: true,
  });
});
