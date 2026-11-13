import { test as baseTest, expect } from "#tests/helpers/browser.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSpeechWav } from "#domain/speech/wav.ts";
import type { Page, Locator } from "@playwright/test";

const test = baseTest.extend<{ projectDirectory: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture dependency syntax.
  projectDirectory: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "prep-voice-"));
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
      speech: {
        available: () => true,
        transcribe: async (bytes) => {
          validateSpeechWav(bytes);
          return "Сначала проверяем данные, затем сохраняем заявку.";
        },
      },
    });
  },
});

// A generated audio stream exercises the real MediaRecorder, browser decoder and WAV encoder.
async function microphone(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const output = context.createMediaStreamDestination();
        oscillator.connect(output);
        oscillator.start();
        const track = output.stream.getTracks()[0]!;
        const original = track.stop.bind(track);
        track.stop = () => {
          original();
          oscillator.stop();
          void context.close();
        };
        return output.stream;
      },
    });
  });
}
async function setup(page: Page, base: string) {
  await microphone(page);
  await page.goto(`${base}/#/intensive`);
  await page
    .getByLabel("Цель подготовки", { exact: true })
    .fill("Разобраться в проекте");
  await page.getByRole("checkbox", { name: /Первый пример/ }).check();
  await page
    .getByRole("button", { name: "Составить программу", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Начать подготовку", exact: true })
    .click();
}
async function record(voice: Locator, page: Page) {
  await voice
    .getByRole("button", { name: "Голосовой ввод", exact: true })
    .click();
  await expect(
    voice.getByRole("status").filter({ hasText: /^Слушаю$/ }),
  ).toBeVisible();
  // Supply real audio frames to MediaRecorder before pause and stop.
  await page.waitForTimeout(350);
  await voice.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(
    voice.getByRole("status").filter({ hasText: /^Пауза$/ }),
  ).toBeVisible();
  await voice
    .getByRole("button", { name: "Продолжить запись", exact: true })
    .click();
}

test("one visible composer accepts typing and dictation, keeps concurrent edits and saves answers and stories", async ({
  app: { base },
  page,
}) => {
  await setup(page, base);
  const voice = page.locator(".intensive-lesson .voice-input").first();
  const answer = page.getByLabel("Ответ или решение", { exact: true });
  await expect(answer).toBeVisible();
  await expect(voice.getByRole("textbox")).toHaveCount(1);
  await expect(page.getByText("Записать ответ", { exact: true })).toHaveCount(
    0,
  );
  await answer.fill("Уже написанный ответ.");
  await record(voice, page);
  await page
    .getByRole("button", { name: "Мой рассказ о проекте", exact: true })
    .click();
  await expect(voice).toContainText(
    "Завершите диктовку или отмените запись перед переходом.",
  );
  let release: (() => Promise<void>) | undefined;
  await page.route("**/api/speech", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise<void>((resolve) => {
      release = async () => {
        await route.fulfill({ json: { text: "Надиктованная часть." } });
        resolve();
      };
    });
  });
  const pending = page.waitForRequest(
    (r) => r.url().endsWith("/api/speech") && r.method() === "POST",
  );
  await voice
    .getByRole("button", { name: "Завершить запись", exact: true })
    .click();
  await pending;
  await answer.fill("Дополненный ответ.");
  await release?.();
  await expect(answer).toHaveValue(
    "Дополненный ответ.\n\nНадиктованная часть.",
  );
  await expect(voice.getByRole("textbox")).toHaveCount(1);
  await expect(
    voice.getByRole("button", { name: "Добавить в ответ", exact: true }),
  ).toHaveCount(0);
  await answer.fill("Исправленный ответ после диктовки.");
  await expect(page.locator(".intensive-save-status")).toHaveText("Сохранено");
  await mkdir("artifacts/voice-input", { recursive: true });
  await voice.screenshot({ path: "artifacts/voice-input/unified-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await voice.screenshot({ path: "artifacts/voice-input/unified-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.unroute("**/api/speech");
  await page.reload();
  await expect(answer).toHaveValue("Исправленный ответ после диктовки.");
  await page
    .getByRole("button", { name: "Мой рассказ о проекте", exact: true })
    .click();
  const storyVoice = page.locator(".intensive-story .voice-input").first();
  const story = page.getByLabel("Для кого проект и какую задачу решает", {
    exact: true,
  });
  await story.fill("Система заявок.");
  await record(storyVoice, page);
  await page
    .getByRole("button", { name: "Прочитать целиком", exact: true })
    .click();
  await expect(
    storyVoice.getByRole("button", { name: "Завершить запись", exact: true }),
  ).toBeVisible();
  await storyVoice
    .getByRole("button", { name: "Завершить запись", exact: true })
    .click();
  await expect(story).toHaveValue(
    "Система заявок.\n\nСначала проверяем данные, затем сохраняем заявку.",
  );
  await expect(storyVoice.getByRole("textbox")).toHaveCount(1);
});

test("failure retains audio for retry while cancellation and microphone denial preserve the same text field", async ({
  app: { base },
  page,
}) => {
  await setup(page, base);
  const voice = page.locator(".intensive-lesson .voice-input").first();
  const answer = voice.getByRole("textbox");
  await answer.fill("Исходный ответ.");
  await page.route("**/api/speech", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { error: "Проверочная ошибка" } })
      : route.continue(),
  );
  await record(voice, page);
  await voice
    .getByRole("button", { name: "Завершить запись", exact: true })
    .click();
  await expect(voice.getByRole("alert")).toHaveText("Проверочная ошибка");
  await expect(
    voice.getByRole("link", { name: "Скачать запись" }),
  ).toBeVisible();
  await expect(answer).toHaveValue("Исходный ответ.");
  await page.unroute("**/api/speech");
  await voice
    .getByRole("button", { name: "Повторить распознавание", exact: true })
    .click();
  await expect(answer).toHaveValue(
    "Исходный ответ.\n\nСначала проверяем данные, затем сохраняем заявку.",
  );
  await record(voice, page);
  await voice
    .getByRole("button", { name: "Отменить диктовку", exact: true })
    .click();
  await expect(answer).toHaveValue(
    "Исходный ответ.\n\nСначала проверяем данные, затем сохраняем заявку.",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
  });
  await voice
    .getByRole("button", { name: "Голосовой ввод", exact: true })
    .click();
  await expect(voice.getByRole("alert")).toHaveText(
    "Разрешите доступ к микрофону в настройках сайта.",
  );
  await expect(answer).toHaveValue(
    "Исходный ответ.\n\nСначала проверяем данные, затем сохраняем заявку.",
  );
});

test("discussion composer keeps dictation unsent and survives blocked navigation and recognition cancellation", async ({
  app: { base },
  page,
}) => {
  await microphone(page);
  await page.goto(`${base}/#/interview`);
  await page.getByRole("link", { name: "Практика", exact: true }).click();
  await page
    .getByRole("button", { name: "Обсудить с помощником", exact: true })
    .click();
  const voice = page.locator(".study-chat .voice-input");
  const input = page.getByRole("textbox", {
    name: "Ваш вопрос или ответ",
    exact: true,
  });
  await expect(input).toBeFocused();
  await input.fill("Вопрос про данные.");
  await record(voice, page);
  const title = await page.locator(".question-card h2").textContent();
  await page
    .getByRole("button", { name: "Закрыть обсуждение", exact: true })
    .click();
  await expect(voice).toContainText(
    "Завершите диктовку или отмените запись перед переходом.",
  );
  await expect(page.locator(".question-card h2")).toHaveText(title!);
  await expect(page.locator("#practiceCategory")).toBeDisabled();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    voice.getByRole("button", { name: "Завершить запись", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(`${base}/#/practice`);
  let reply: (() => Promise<void>) | undefined;
  await page.route("**/api/speech", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise<void>((resolve) => {
      reply = async () => {
        await route
          .fulfill({ json: { text: "Поздний ответ" } })
          .catch(() => {});
        resolve();
      };
    });
  });
  const pending = page.waitForRequest(
    (r) => r.url().endsWith("/api/speech") && r.method() === "POST",
  );
  await voice
    .getByRole("button", { name: "Завершить запись", exact: true })
    .click();
  await pending;
  await voice
    .getByRole("button", { name: "Остановить распознавание", exact: true })
    .click();
  await reply?.();
  await expect(input).toHaveValue("Вопрос про данные.");
  await expect(
    voice.getByRole("link", { name: "Скачать запись" }),
  ).toBeVisible();
  await page.unroute("**/api/speech");
  await voice
    .getByRole("button", { name: "Повторить распознавание", exact: true })
    .click();
  await expect(input).toHaveValue(
    "Вопрос про данные.\n\nСначала проверяем данные, затем сохраняем заявку.",
  );
  await expect(page.locator(".study-message")).toHaveCount(0);
  await expect(
    voice.getByRole("button", { name: "Отправить", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("#practiceCategory")).toBeEnabled();
  await page
    .getByRole("button", { name: "Закрыть обсуждение", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator('[data-action="next-question"]').click();
  await expect(page.locator(".question-card h2")).not.toHaveText(title!);
});

test("text remains editable and saved without an installed speech engine", async ({
  app: { base },
  page,
}) => {
  await page.route("**/api/speech", (route) =>
    route.fulfill({ json: { available: false } }),
  );
  await setup(page, base);
  const voice = page.locator(".intensive-lesson .voice-input").first();
  await expect(
    voice.getByRole("button", { name: "Голосовой ввод", exact: true }),
  ).toBeDisabled();
  await voice.getByRole("textbox").fill("Обычный текст без диктовки.");
  await expect(page.locator(".intensive-save-status")).toHaveText("Сохранено");
  await page.reload();
  await expect(voice.getByRole("textbox")).toHaveValue(
    "Обычный текст без диктовки.",
  );
});
