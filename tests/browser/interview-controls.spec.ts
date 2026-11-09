import { resolve } from "node:path";
import { test, expect } from "#tests/helpers/browser.ts";
import {
  restoreProgressFixture,
  readProgress,
} from "#tests/helpers/browser-progress.ts";
import { createSession } from "#domain/interview/selection.ts";
import { loadState } from "#domain/interview/saved-state.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import type { Question } from "#domain/knowledge/question.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

for (const kind of ["daily", "full"] as const)
  test(`${kind}: reveal persists and a followup stays reachable after back, reload and next/back`, async ({
    app: { base },
    page,
  }) => {
    const root: Question = {
      id: `controls-${kind}`,
      source: "knowledge",
      kind: "theory",
      category: "JavaScript",
      title: "Почему поздний ответ заменяет новый результат?",
      prompt: "Почему поздний ответ заменяет новый результат?",
      answer: "Перед применением ответа проверяется актуальность запроса.",
      criteria: "Порядок ответов и проверка актуальности.",
      followups: [
        "Когда отменять запрос?",
        "Как не сбросить индикатор нового запроса?",
        "Как воспроизвести обратный порядок ответов?",
      ],
    };
    const other = {
      ...root,
      id: `other-${kind}`,
      title: "Другой вопрос",
      prompt: "Другой вопрос",
      followups: [],
    };
    const session = createSession([root, other], kind);
    session.questionIds = [root.id, other.id];
    session.ratings[root.id] = "partial";
    const state = loadState({ getItem: () => null });
    state.questionProgress[root.id] = {
      status: "partial",
      updatedAt: "2026-11-09",
    };
    if (kind === "daily") {
      session.id = `daily:${session.date}`;
      state.daily[session.date] = session;
    } else state.sessions[session.id] = session;
    await page.goto(base);
    await restoreProgressFixture(page, state);
    await page.goto(
      base +
        `/?controls=${kind}#/interview?` +
        new URLSearchParams({ session: session.id }),
    );
    await expect(page.locator(".question-card h2")).toHaveText(root.title);
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await expect(page.locator('[data-action="session-review"]')).toBeVisible({
      timeout: 1500,
    });
    await page.locator('[data-action="session-review"]').click();
    await expect(page.locator(".platform-answer")).toContainText(root.answer);
    await page.reload();
    await expect(page.locator(".platform-answer")).toContainText(root.answer);
    let last = "";
    for (let index = 0; index < (kind === "daily" ? 1 : 2); index++) {
      await page.locator('[data-action="session-followup"]').click();
      await expect(page.locator(".question-card h2")).not.toHaveText(
        root.title,
      );
      last = await page.locator(".question-card h2").innerText();
      await page.locator('[data-action="session-previous"]').click();
      await expect(page.locator(".question-card h2")).toHaveText(root.title);
    }
    await expect(page.locator('[data-action="session-followup"]')).toBeVisible({
      timeout: 1500,
    });
    await page.reload();
    await page.locator('[data-action="session-followup"]').click();
    await expect(page.locator(".question-card h2")).toHaveText(last);
    await page.locator('[data-action="session-previous"]').click();
    await page.locator('[data-action="session-next"]').click();
    await expect(page.locator(".question-card h2")).toHaveText(other.title);
    await page.locator('[data-action="session-previous"]').click();
    await page.locator('[data-action="session-followup"]').click();
    await expect(page.locator(".question-card h2")).toHaveText(last);
    const saved = await readProgress(page),
      current =
        kind === "daily"
          ? saved.daily[session.date]!
          : saved.sessions[session.id]!;
    expect(current.snapshots).toEqual(session.snapshots);
    expect(current.questionIds).toEqual(session.questionIds);
    expect(current.ratings).toEqual(session.ratings);
    expect(current.skipped).toEqual([]);
    expect(saved.questionProgress).toEqual(state.questionProgress);
    expect(current.followupChoices?.[root.id]).toHaveLength(
      kind === "daily" ? 1 : 2,
    );
    await page.locator('[data-action="session-finish"]').click();
    await expect(
      page.getByRole("heading", { name: "Разбор интервью", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".platform-answer")).toHaveCount(2);
  });

test("testing tasks are absent from practice including direct links and advanced practice, while theory remains", async ({
  app: { base },
  page,
}) => {
  const bank = loadCommonKnowledge();
  const tasks = bank.questions.filter(
    (q) => q.kind === "practice" && q.category === "Тестирование",
  );
  expect(tasks).toHaveLength(8);
  await page.goto(base + "/#/practice");
  await page.locator("#practiceCategory").selectOption("Тестирование");
  await page.locator("#practiceKind").selectOption("practice");
  await expect(page.locator(".question-card")).toHaveCount(0);
  for (const task of tasks) {
    for (const level of ["", "advanced"]) {
      await page.goto(
        base +
          "/#/practice?" +
          new URLSearchParams({
            question: task.id,
            ...(level ? { level } : {}),
          }),
      );
      await expect(page.locator("#platformMain")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expect(page.locator(".question-card")).toHaveCount(0);
    }
  }
  const theory = bank.questions.find(
    (q) => q.kind === "theory" && q.category === "Тестирование",
  )!;
  await page.goto(
    base + "/#/practice?" + new URLSearchParams({ question: theory.id }),
  );
  await expect(page.locator(".question-card h2")).toHaveText(theory.title);
});
