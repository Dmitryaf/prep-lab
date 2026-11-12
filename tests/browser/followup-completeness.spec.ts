import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { test, expect } from "#tests/helpers/browser.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { createSession, loadState } from "#domain/interview/engine.ts";
import { restoreProgressFixture } from "#tests/helpers/browser-progress.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

test("new React and SQL examples render as code without widening the page", async ({
  app: { base },
  page,
}) => {
  const knowledge = loadCommonKnowledge();
  for (const [title, snippet] of [
    ["Ревью компонента с запросами", "const finishA ="],
    ["Как работают JOIN и агрегирование?", "COUNT(o.id)"],
  ] as const) {
    const question = knowledge.questions.find((item) => item.title === title)!;
    await page.goto(
      `${base}/#/practice?question=${encodeURIComponent(question.id)}`,
    );
    await page.locator('[data-action="reveal"]').click();
    await page.getByRole("tab", { name: /^Уточнения/ }).click();
    const code = page
      .locator(".answer-followups pre")
      .filter({ hasText: snippet });
    await expect(code).toBeVisible();
    await mkdir("artifacts/followup-completeness", { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await code.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/followup-completeness/${snippet.startsWith("const") ? "react" : "sql"}-${width}.png`,
      });
    }
  }
});

test("completed legacy topics have independent explanations in new interviews", async ({
  app: { base },
  page,
}) => {
  const knowledge = loadCommonKnowledge();
  for (const title of [
    "Как отправить много запросов, выполняя не больше трёх одновременно?",
    "Как избежать SQL-инъекции?",
    "Как работают каскад и специфичность CSS?",
    "Как выполнять большие выборки?",
    "Как выбрать границу транзакции?",
  ]) {
    const question = knowledge.questions.find((item) => item.title === title)!;
    expect(question).toBeTruthy();
    expect(question.followupAnswers).toHaveLength(question.followups.length);
    const session = createSession([question], "full");
    const state = loadState({ getItem: () => null });
    state.sessions[session.id] = session;
    await page.goto(base);
    await restoreProgressFixture(page, state);
    await page.goto(
      `${base}/#/interview?session=${encodeURIComponent(session.id)}`,
    );
    await expect(page.locator(".question-card h2")).toHaveText(title);
    await page.locator('[data-action="session-followup"]').click();
    const selectedTitle = await page
      .locator(".followup-question h3")
      .innerText();
    const explanation = question.followupAnswers!.find(
      (item) => item.title === selectedTitle,
    )!;
    expect(explanation).toBeTruthy();
    await expect(page.locator(".platform-answer")).toHaveCount(0);
    await page.locator('[data-action="followup-review"]').click();
    // Code markers are rendered away; compare the opening prose when possible.
    const opening = explanation.answer.split("\n")[0]!.replaceAll("`", "");
    await expect(page.locator(".platform-answer")).toContainText(opening);
    await expect(page.locator(".followup-question")).not.toContainText(
      "Отдельный разбор этого уточнения пока не добавлен",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
