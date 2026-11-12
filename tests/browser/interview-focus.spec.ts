import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { test, expect } from "#tests/helpers/browser.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { createSession, loadState } from "#domain/interview/engine.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "#tests/helpers/browser-progress.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});
const bank = loadCommonKnowledge();
const theory = bank.questions.find((q) => q.title === "От чего зависит this?")!;
const coding = bank.questions.find(
  (q) => q.title === "Реализовать Promise.all",
)!;

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  for (const stage of ["theory", "coding", "followup"] as const) {
    test(`${stage} at ${viewport.width}: principles stay outside the card and the primary action follows the active answer`, async ({
      app: { base },
      page,
    }, info) => {
      await page.setViewportSize(viewport);
      const question = stage === "coding" ? coding : theory;
      const session = createSession(
        [question],
        "full",
        {},
        "vue",
        stage === "coding" ? "coding" : "mixed",
      );
      const snapshot = session.snapshots[question.id]!;
      // A second question lets us verify navigation without requiring a reveal or rating.
      const next = {
        ...snapshot,
        id: "focus-next",
        title: "Следующий проверочный вопрос",
      };
      session.questionIds.push(next.id);
      session.snapshots[next.id] = next;
      if (stage === "followup") {
        session.followupIndex = 1;
        session.followupChoices = { [question.id]: [0] };
        session.reviewed = [question.id];
      }
      const state = loadState({ getItem: () => null });
      state.sessions[session.id] = session;
      await page.goto(base);
      await restoreProgressFixture(page, state);
      await page.goto(
        `${base}/#/interview?session=${encodeURIComponent(session.id)}`,
      );
      await expect(page.locator(".question-card h2")).toHaveText(
        question.title,
      );
      const guide = page.locator(".question-approach");
      const review = page.locator(
        `[data-action="${stage === "followup" ? "followup-review" : "session-review"}"]`,
      );
      const advance = page.locator('[data-action="session-next"]');
      await page.screenshot({
        path: info.outputPath("initial.png"),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await writeFile(
        info.outputPath("geometry.json"),
        JSON.stringify(
          {
            question: await page.locator(".question-card h2").boundingBox(),
            guide: await guide.boundingBox(),
            review: await review.boundingBox(),
            discussion: await page.locator(".study-chat").boundingBox(),
          },
          null,
          2,
        ),
      );
      await expect(guide.locator("details, summary, button")).toHaveCount(0);
      await expect(guide.locator("p")).toHaveCount(1);
      await expect(guide.locator("p")).toBeVisible();
      await expect(
        page.locator(".question-card .question-approach"),
      ).toHaveCount(0);
      await expect(review).toHaveClass(/primary/);
      await expect(advance).not.toHaveClass(/primary/);
      expect(
        await review.evaluate(
          (element) =>
            !!(
              element.compareDocumentPosition(
                document.querySelector(".study-chat")!,
              ) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
        ),
      ).toBe(true);
      const before = await readProgress(page);
      await expect(guide.locator("p")).toBeVisible();
      await expect(page.locator(".platform-answer")).toHaveCount(0);
      expect(await readProgress(page)).toEqual(before);
      await review.click();
      await expect(page.locator(".platform-answer")).toBeVisible();
      await expect(
        page.locator(".question-card nav[aria-label='Материалы вопроса']"),
      ).toHaveCount(0);
      await expect(
        page.locator(".question-resources nav[aria-label='Материалы вопроса']"),
      ).toBeVisible();
      await expect(page.locator(".question-card details")).toHaveCount(0);
      await expect(advance).toHaveClass(/primary/);
      await page.screenshot({
        path: info.outputPath("revealed.png"),
        fullPage: true,
      });
      await advance.click();
      await expect(page.locator(".question-card h2")).toHaveText(next.title);
      await expect(guide.locator("p")).toBeVisible();
      await expect(advance).not.toHaveClass(/primary/);
      await expect(page.locator('[data-action="session-review"]')).toHaveClass(
        /primary/,
      );
      expect(
        (await readProgress(page)).sessions[session.id]!.snapshots[question.id],
      ).toEqual(snapshot);
      // Moving on remains possible before checking the next answer.
      await advance.click();
      await expect
        .poll(
          async () => (await readProgress(page)).sessions[session.id]!.finished,
        )
        .toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}
