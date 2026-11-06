import { test as baseTest, expect } from "#tests/helpers/browser.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";
import { readProgress } from "#tests/helpers/browser-progress.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectFromDraft } from "#domain/projects/from-draft.ts";

const test = baseTest.extend<{ projectDirectory: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture dependency list.
  projectDirectory: async ({}, use) => {
    const directory = await mkdtemp(
      join(tmpdir(), "frontend-lab-project-fixture-"),
    );
    try {
      await writeFile(
        join(directory, "projects.json"),
        JSON.stringify(projectFixture()),
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

test("an accepted project shows its scenario without duplicate prose or empty sections", async ({
  app: { base },
  page,
  projectDirectory,
}) => {
  let sequence = 0;
  const { catalog } = projectFromDraft(
    {
      schemaVersion: 1,
      name: "Записная книжка",
      summary: "Приложение сохраняет заметки в браузере.",
      roleFacts: [],
      unknowns: ["Нужно уточнить, кто добавил поиск."],
      topics: [
        {
          title: "Как сохраняется заметка",
          explanation: "Пользователь вводит текст и нажимает Сохранить.",
          mechanism: [
            "Форма проверяет текст.",
            "Хранилище записывает заметку.",
          ],
          tradeoff: "Данные доступны только в этом браузере.",
          questions: [
            {
              question: "Что происходит после нажатия Сохранить?",
              answer: "Форма проверяет текст и передаёт заметку в хранилище.",
              criteria: "Проверка текста и запись заметки.",
            },
          ],
          codeReferences: [],
        },
      ],
    },
    { profile: "vue", request: "Разобрать проект", context: "", materials: [] },
    () => String(++sequence),
  );
  await writeFile(
    join(projectDirectory, "projects.json"),
    JSON.stringify(catalog),
  );
  await page.goto(base + "/#/projects?projectTopic=" + catalog.topics[0]!.id);
  await expect(page.locator(".topic-title")).toHaveText(
    "Как сохраняется заметка",
  );
  await expect(
    page.getByText("Пользователь вводит текст и нажимает Сохранить.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(page.locator(".topic-outline button")).toHaveText([
    "01Как это работает",
    "02Вопросы на собеседовании",
  ]);
  await expect(
    page.locator('[data-section="study"], [data-section="code"]'),
  ).toHaveCount(0);
  await page.locator(".interview-question > summary").click();
  await expect(page.locator(".interview-answer")).toContainText(
    "Форма проверяет текст и передаёт заметку в хранилище.",
  );
  await expect(page.locator(".interview-answer details")).toHaveCount(0);
  await expect(
    page.getByText("Моя работа в проекте", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#details")).not.toContainText("Нужно уточнить");
  await expect(page.locator("#details")).not.toContainText("авторство");
});
test("portable project package supports reading, code copying, shared settings and repeating questions", async ({
  app: { base },
  page,
  context,
  projectDirectory,
}) => {
  const catalog = projectFixture();
  catalog.topics[0]!.story = {
    short: "Добавил проверку формы перед сохранением.",
    confirmed: "",
    deep: ["При ошибке форма сохраняет введённые данные."],
    assumptions: "",
    reconstruction: "",
    boundaries: "",
  };
  await writeFile(
    join(projectDirectory, "projects.json"),
    JSON.stringify(catalog),
  );
  await page.goto(base + "/#/projects?projectTopic=first-main");
  await expect(page.locator(".topic-title")).toHaveText("Контракт операции");
  await expect(page.locator(".reading-location")).toContainText(
    "Первый пример",
  );
  await page.getByText("Моя работа в проекте", { exact: true }).click();
  await expect(
    page.getByText("Добавил проверку формы перед сохранением.", {
      exact: true,
    }),
  ).toBeVisible();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator(".local-settings summary").click();
  await page.locator("#sourceRoot").fill("C:\\Work\\Example");
  await page.locator("[data-action=copy-source]").first().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split(/\r?\n/)).toEqual([
    "C:\\Work\\Example\\src\\example.ts:1",
    "validateInput",
  ]);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(base + "/api/settings")).json()).settings
          .sourceRoot,
    )
    .toBe("C:\\Work\\Example");
  await page.locator("[data-action=back-to-topics]").click();
  await page.locator("[data-action=project-practice]").click();
  await expect(page.getByText("1 из 18", { exact: true })).toBeVisible();
  await page.locator("[data-action=reveal]").click();
  const title = await page.locator(".question-card h2").innerText();
  await page.locator("[data-rating=again]").click();
  await readProgress(page);
  await page.locator('#platformNav a[href="#/repeat"]').click();
  await expect(page.locator(".platform-list-row")).toContainText(title);
  await page.reload();
  await expect(page.locator(".platform-list-row")).toContainText(title);
});
