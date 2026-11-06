import { test, expect } from "#tests/helpers/browser.ts";
import { projectDraftFixture } from "#tests/fixtures/project-draft.ts";
import type { Knowledge } from "#domain/knowledge/material.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

let targetId = "";
let delayNextObservation = false;
let observationAborted = false;
const addition = "Дополнительный вопрос проверки объединения";
test.use({
  appOptions: {
    projectPackageRoot: null,
    generationAnswer: async ({ trustedTask, context, signal }) => {
      const payload = JSON.parse(context);
      if (trustedTask?.startsWith("ANALYSIS_PHASE:project-observe")) {
        if (delayNextObservation) {
          delayNextObservation = false;
          try {
            await delay(30_000, undefined, { signal });
          } catch (error) {
            observationAborted = signal.aborted;
            throw error;
          }
        }
        return JSON.stringify({
          summary:
            "Форма отправляет имя пользователя и показывает результат регистрации.",
        });
      }
      if (trustedTask?.startsWith("ANALYSIS_PHASE:project-final")) {
        const source = (
          payload.inventory as { id: string; path: string }[]
        ).find((item) => item.path.endsWith("form.ts"))!;
        return JSON.stringify({
          ...projectDraftFixture,
          name: "Проект из папки",
          roleFacts: [],
          unknowns: [],
          summary: "Форма регистрации пользователя.",
          stack: ["TypeScript"],
          map: {
            nodes: [
              {
                id: "registration",
                label: "Регистрация",
                kind: "scenario",
                description: "Пользователь заполняет форму.",
                topicIndexes: [0],
              },
            ],
            edges: [],
          },
          topics: projectDraftFixture.topics.map((topic) => ({
            ...topic,
            codeReferences: [
              {
                sourceId: source.id,
                startLine: 1,
                endLine: 1,
                explanation: "Функция создаёт запись пользователя.",
              },
            ],
          })),
        });
      }
      if (trustedTask?.startsWith("ANALYSIS_PHASE:import-match"))
        return JSON.stringify({
          noteIds: (payload.notes as { id: string }[])
            .filter((note) => note.id === targetId)
            .map((note) => note.id),
        });
      if (trustedTask?.startsWith("ANALYSIS_PHASE:import-compare")) {
        const note = (payload.notes as Knowledge["notes"]).find(
          (note) => note.id === targetId,
        );
        return JSON.stringify({
          changes: [
            ...(note
              ? [
                  {
                    action: "update",
                    targetId: note.id,
                    title: note.title,
                    markdown:
                      note.markdown +
                      `\n\n## ${addition}\n\n> [!answer]- Ответ\n> Дополненный ответ из нового материала.\n`,
                    reason: "Добавлен вопрос по новой теме.",
                  },
                ]
              : []),
            {
              action: "add",
              title: "Новая тема из материалов",
              markdown:
                "# Новая тема из материалов\n\n## Как проверить новую тему?\n\n> [!answer]- Ответ\n> Проверить её на примере.\n",
              reason: "В базе этой темы нет.",
            },
            {
              action: "skip",
              title: "Повтор существующего объяснения",
              markdown: "",
              reason: "Объяснение уже есть в базе.",
            },
          ],
        });
      }
      throw new Error(
        "Unexpected analysis phase: " + trustedTask?.slice(0, 100),
      );
    },
  },
});

test("analysis cancellation reaches the assistant and uploaded files can be retried after reload", async ({
  app: { base },
  page,
}) => {
  delayNextObservation = true;
  observationAborted = false;
  await page.goto(base + "/#/sources");
  await page
    .getByRole("radio", { name: "Загрузить файлы", exact: true })
    .check();
  await page.getByLabel("Файлы или ZIP-архив", { exact: true }).setInputFiles({
    name: "form.ts",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "export const register = (name: string) => ({ name });\n",
    ),
  });
  await page
    .getByRole("button", { name: "Начать анализ", exact: true })
    .click();
  const result = page.getByRole("region", { name: "Результат анализа" });
  await expect(result).toContainText("Идёт анализ");
  await expect.poll(() => delayNextObservation).toBe(false);
  await page
    .getByRole("button", { name: "Остановить анализ", exact: true })
    .click();
  await expect(result).toContainText("Остановлено");
  expect(observationAborted).toBe(true);
  const stopped = await (await page.request.get(base + "/api/analysis")).json();
  expect(stopped.jobs).toHaveLength(1);
  expect(stopped.jobs[0].status).toBe("cancelled");
  await page.reload();
  await page
    .getByRole("button", { name: "Повторить анализ", exact: true })
    .click();
  await expect(result).toContainText("Готово к просмотру");
  await page
    .getByRole("button", { name: "Добавить разбор проекта", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Открыть проект", exact: true }),
  ).toBeVisible();
  const retried = await (await page.request.get(base + "/api/analysis")).json();
  expect(retried.jobs).toHaveLength(2);
  expect(
    new Set(
      retried.jobs.map((job: { connectionId: string }) => job.connectionId),
    ).size,
  ).toBe(1);
  expect(
    retried.jobs.filter((job: { status: string }) => job.status === "accepted"),
  ).toHaveLength(1);
});

test("a project folder is analyzed, accepted and checked for updates from one page", async ({
  app: { base },
  page,
}, info) => {
  const directory = await mkdtemp(join(tmpdir(), "frontend-lab-analysis-ui-"));
  await writeFile(
    join(directory, "README.md"),
    "# Регистрация\nФорма создания пользователя.",
  );
  await writeFile(
    join(directory, "form.ts"),
    "export const register = (name: string) => ({ name });\n",
  );
  try {
    await page.goto(base + "/#/sources");
    await expect(
      page.getByRole("heading", { name: "Свои материалы", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Папки проектов — по одной в строке", { exact: true })
      .fill(directory);
    await page
      .getByRole("button", { name: "Начать анализ", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Результат анализа" }),
    ).toContainText("Готово к просмотру");
    await expect(
      page.getByText("Валидация формы", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByText("Валидация формы", { exact: true }).click();
    await expect(
      page.getByText("Чем отличаются проверки в форме и на сервере?", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Добавить разбор проекта", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Открыть проект", exact: true }),
    ).toBeVisible();
    const catalog = await (
      await page.request.get(base + "/api/projects")
    ).json();
    expect(
      Object.values(catalog.projects).some(
        (project) => (project as { name: string }).name === "Проект из папки",
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Проверить обновления", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Результат анализа" }),
    ).toContainText("Изменений нет");
    await page.screenshot({
      path: info.outputPath("analysis-result-desktop.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Новое подключение", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("analysis-form-mobile.png"),
      fullPage: true,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("uploaded materials are compared with the current base and only selected changes are accepted", async ({
  app: { base },
  page,
}) => {
  const before: Knowledge = await (
    await page.request.get(base + "/api/knowledge")
  ).json();
  const note = before.notes.find(
    (note) =>
      before.questions.some((question) => question.noteId === note.id) &&
      note.category === "JavaScript",
  )!;
  expect(note).toBeTruthy();
  targetId = note.id;
  const originalIds = before.questions
    .filter((question) => question.noteId === targetId)
    .map((question) => question.id);
  await page.goto(base + "/#/sources");
  await page
    .getByRole("radio", { name: "Дополнить базу знаний", exact: true })
    .check();
  await page
    .getByRole("radio", { name: "Загрузить файлы", exact: true })
    .check();
  await page.getByLabel("Файлы или ZIP-архив", { exact: true }).setInputFiles([
    {
      name: "Заметки.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Заметки\nНовая информация и примеры JavaScript."),
    },
    {
      name: ".env",
      mimeType: "text/plain",
      buffer: Buffer.from("TOKEN=private-value"),
    },
  ]);
  const submission = page.waitForRequest(
    (request) =>
      request.url() === base + "/api/analysis" && request.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Начать анализ", exact: true })
    .click();
  expect(
    (await submission)
      .postDataJSON()
      .files.map((file: { path: string }) => file.path),
  ).toEqual(["Заметки.md"]);
  await expect(
    page.getByRole("region", { name: "Результат анализа" }),
  ).toContainText("Готово к просмотру");
  await expect(
    page.getByRole("checkbox", { name: note.title, exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: "Новая тема из материалов",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: "Повтор существующего объяснения",
      exact: true,
    }),
  ).toBeDisabled();
  const unchanged: Knowledge = await (
    await page.request.get(base + "/api/knowledge")
  ).json();
  expect(unchanged.notes.find((item) => item.id === note.id)?.markdown).toBe(
    note.markdown,
  );
  await page
    .getByRole("checkbox", { name: "Новая тема из материалов", exact: true })
    .uncheck();
  await page
    .getByRole("button", {
      name: "Принять выбранные изменения (1)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Открыть базу знаний", exact: true }),
  ).toBeVisible();
  const after: Knowledge = await (
    await page.request.get(base + "/api/knowledge")
  ).json();
  expect(after.notes.find((item) => item.id === targetId)?.markdown).toContain(
    addition,
  );
  expect(
    after.notes.some((item) => item.title === "Новая тема из материалов"),
  ).toBe(false);
  for (const id of originalIds)
    expect(after.questions.some((question) => question.id === id)).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Открыть базу знаний", exact: true }),
  ).toBeVisible();
});
