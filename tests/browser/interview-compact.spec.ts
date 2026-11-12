import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "#tests/helpers/browser.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { createSession, loadState } from "#domain/interview/engine.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "#tests/helpers/browser-progress.ts";

const bank = loadCommonKnowledge();
const first = bank.questions.find((q) => q.title === "От чего зависит this?")!;
const questions = [
  first,
  ...bank.questions
    .filter(
      (q) =>
        q.category === "JavaScript" &&
        q.kind === first.kind &&
        q.id !== first.id,
    )
    .slice(0, 19),
];
const artifactDirectory = resolve(
  process.env.INTERVIEW_UI_ARTIFACT_DIR ||
    "artifacts/playwright/interview-compact",
);
test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
    speech: { available: () => true, transcribe: async () => "Тестовый текст" },
  },
});

async function sessionFixture(page: Page, base: string, finished: boolean) {
  const session = createSession([first], "full");
  session.id = "compact-interview-fixture";
  session.questionIds = questions.map((q) => q.id);
  session.snapshots = Object.fromEntries(
    questions.map((q) => [q.id, { ...q }]),
  );
  session.snapshots[first.id] = {
    ...first,
    answer:
      "Исторический ответ: this определяется способом вызова. Этот текст сохранён в интервью.",
    shortAnswer:
      "Исторический ответ: this определяется способом вызова. Этот текст сохранён в интервью.",
  };
  session.finished = finished;
  session.skipped = [questions[2]!.id];
  session.ratings = { [first.id]: "partial" };
  session.attempts = {
    [first.id]: {
      text: "Сохранённая попытка до изменения интерфейса",
      solutionUrl: "https://example.com/solution",
      updatedAt: "2026-11-01",
    },
  };
  session.reviewed = [first.id];
  if (!finished) session.reviewed = [];
  const state = loadState({ getItem: () => null });
  state.sessions[session.id] = session;
  await page.goto(base);
  await restoreProgressFixture(page, state);
  await page.goto(`${base}/#/interview?session=${session.id}`);
  await expect(page.locator("#platformMain h1")).toHaveText(
    finished ? "Разбор интервью" : "Полное интервью",
  );
  await readProgress(page);
  return session;
}

async function screenshot(page: Page, name: string) {
  await mkdir(artifactDirectory, { recursive: true });
  const phase = process.env.INTERVIEW_UI_PHASE || "after";
  await page.screenshot({
    path: resolve(artifactDirectory, `${phase}-${name}.png`),
  });
  await writeFile(
    resolve(artifactDirectory, `${phase}-${name}.json`),
    JSON.stringify(
      {
        header: await page.locator(".platform-header").boundingBox(),
        heading: await page.locator("#platformMain h1").boundingBox(),
        question: (await page.locator(".question-card h2").count())
          ? await page.locator(".question-card h2").first().boundingBox()
          : null,
        pageHeight: await page.evaluate(
          () => document.documentElement.scrollHeight,
        ),
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      },
      null,
      2,
    ),
  );
}

for (const width of [390, 1440]) {
  test(`interview navigation and twenty historical results stay compact at ${width}`, async ({
    app: { base },
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await sessionFixture(page, base, false);
    await screenshot(page, `active-${width}`);
    if (width === 390) {
      const menu = page.getByRole("button", { name: "Меню", exact: true });
      await menu.click();
      await expect(page.getByLabel("Стек интервью")).toBeDisabled();
      await expect(page.getByLabel("Найти материал")).toBeDisabled();
      await expect(page.locator("#platformNav a")).toHaveCount(8);
      await menu.click();
      await expect(
        page.locator('[data-action="session-review"]'),
      ).toBeVisible();
    }
    const session = await sessionFixture(page, base, true);
    await screenshot(page, `finished-${width}`);
    const before = await readProgress(page);
    const menu = page.getByRole("button", { name: "Меню", exact: true });
    if (width === 390) {
      await expect(menu).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Основные разделы" }),
      ).not.toBeVisible();
      expect(
        (await page.locator(".platform-header").boundingBox())!.height,
      ).toBeLessThan(100);
      await menu.focus();
      await page.keyboard.press("Enter");
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#platformNav a")).toHaveCount(8);
      for (const link of await page.locator("#platformNav a").all())
        await expect(link).toBeVisible();
      await expect(page.getByLabel("Стек интервью")).toBeVisible();
      await expect(page.getByLabel("Найти материал")).toBeVisible();
      await screenshot(page, `menu-${width}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toBeFocused();
      await page.locator("#platformMain").focus();
      await page.keyboard.press("/");
      await expect(page.getByLabel("Найти материал")).toBeFocused();
      await page.keyboard.press("Escape");
    } else {
      await expect(menu).not.toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Основные разделы" }),
      ).toBeVisible();
    }
    const rows = page.locator('[data-action="result-toggle"]');
    await expect(rows).toHaveCount(20);
    await expect(page.locator(".question-card")).toHaveCount(0);
    await expect(rows.nth(0)).toContainText("Частично");
    await expect(rows.nth(2)).toContainText("Пропущен");
    await rows.first().focus();
    await page.keyboard.press("Enter");
    await expect(rows.first()).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".question-card")).toHaveCount(1);
    await expect(page.locator(".platform-answer")).toContainText(
      "Исторический ответ",
    );
    await expect(
      page.getByRole("group", { name: "Результат ответа" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Карточка в базе", exact: true }),
    ).toBeVisible();
    expect(await readProgress(page)).toEqual(before);
    await screenshot(page, `opened-${width}`);
    await page
      .getByRole("button", { name: "Ответил уверенно", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await readProgress(page)).sessions[session.id]!.ratings[first.id],
      )
      .toBe("done");
    await expect(rows.first()).toContainText("Ответил уверенно");
    const rated = await readProgress(page);
    if (width === 1440) {
      await rows.last().focus();
      await page.keyboard.press("Enter");
    } else await rows.last().click();
    await expect(rows.first()).toHaveAttribute("aria-expanded", "false");
    await expect(rows.last()).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".question-card h2")).toHaveText(
      questions.at(-1)!.title,
    );
    await expect(page.locator(".question-card h2")).toBeInViewport();
    await screenshot(page, `last-opened-${width}`);
    await rows.last().click();
    await expect(page.locator(".question-card")).toHaveCount(0);
    expect(await readProgress(page)).toEqual(rated);
    expect((await readProgress(page)).sessions[session.id]!.snapshots).toEqual(
      session.snapshots,
    );
    expect((await readProgress(page)).sessions[session.id]!.attempts).toEqual(
      session.attempts,
    );
    await page.reload();
    await expect(page.locator('[data-action="result-toggle"]')).toHaveCount(20);
    await expect(page.locator(".question-card")).toHaveCount(0);
    await expect(
      page.locator('[data-action="result-toggle"]').first(),
    ).toContainText("Ответил уверенно");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.getByRole("button", { name: "Меню", exact: true }).click();
    await page.getByRole("link", { name: "Практика", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Основные разделы" }),
    ).toBeVisible();
    await expect(page.getByLabel("Найти материал")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Меню", exact: true }),
    ).toHaveCount(0);
  });
}

test("finished result switching keeps the recording editor mounted until dictation is cancelled", async ({
  app: { base },
  page,
}) => {
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
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          oscillator.stop();
          void context.close();
        };
        return output.stream;
      },
    });
  });
  const session = await sessionFixture(page, base, true);
  const rows = page.locator('[data-action="result-toggle"]');
  await rows.first().click();
  await page
    .getByRole("button", { name: "Обсудить с помощником", exact: true })
    .click();
  const composer = page.getByRole("textbox", {
    name: "Ваш вопрос или ответ",
    exact: true,
  });
  await composer.fill("Мой несохранённый вопрос");
  await page
    .getByRole("button", { name: "Голосовой ввод", exact: true })
    .click();
  await expect(
    page
      .locator(".voice-input")
      .getByRole("status")
      .filter({ hasText: /^Слушаю$/ }),
  ).toBeVisible();
  await rows.nth(1).click();
  await expect(rows.first()).toHaveAttribute("aria-expanded", "true");
  await expect(rows.nth(1)).toHaveAttribute("aria-expanded", "false");
  await expect(composer).toHaveValue("Мой несохранённый вопрос");
  await expect(page.locator(".voice-input")).toContainText(
    "Завершите диктовку или отмените запись перед переходом.",
  );
  await rows.first().click();
  await expect(composer).toBeVisible();
  await page
    .getByRole("button", { name: "Отменить диктовку", exact: true })
    .click();
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".question-card h2")).toHaveText(
    questions[1]!.title,
  );
  await rows.first().click();
  await expect(composer).toHaveValue("Мой несохранённый вопрос");
  await rows.first().click();
  await expect(composer).not.toBeVisible();
  await rows.first().click();
  await expect(composer).toHaveValue("Мой несохранённый вопрос");
  expect((await readProgress(page)).sessions[session.id]!.snapshots).toEqual(
    session.snapshots,
  );
});
