import { resolve } from "node:path";
import { test, expect } from "#tests/helpers/browser.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { createSession, loadState } from "#domain/interview/engine.ts";
import { restoreProgressFixture } from "#tests/helpers/browser-progress.ts";

test.use({
  viewport: { width: 1100, height: 600 },
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});
const question = loadCommonKnowledge().questions.find(
  (q) => q.title === "От чего зависит this?",
)!;

for (const action of ["focus", "route", "link"] as const) {
  test(`interview preserves followup answer and reading position after ${action}`, async ({
    app: { base },
    page,
  }) => {
    const session = createSession([question], "full", {}, "vue", "mixed");
    session.followupIndex = 1;
    session.followupChoices = { [question.id]: [0] };
    session.reviewed = [question.id];
    const state = loadState({ getItem: () => null });
    state.sessions[session.id] = session;
    await page.goto(base);
    await restoreProgressFixture(page, state);
    const url = `${base}/#/interview?session=${encodeURIComponent(session.id)}`;
    await page.goto(url);
    await page.locator('[data-action="followup-review"]').click();
    await expect(page.locator(".platform-answer")).toBeVisible();
    await page.evaluate(() =>
      window.scrollTo(
        0,
        Math.min(650, document.documentElement.scrollHeight - innerHeight),
      ),
    );
    const position = await page.evaluate(() => scrollY);
    expect(position).toBeGreaterThan(100);
    if (action === "focus") {
      const response = page.waitForResponse(
        (r) =>
          r.url().includes("/api/preparation") &&
          r.request().method() === "GET",
      );
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await response;
    } else {
      await page.evaluate(() => {
        location.hash = "#/themes";
      });
      await expect(page.locator(".question-card")).toHaveCount(0);
      if (action === "route") await page.goBack();
      else
        await page.evaluate((hash) => {
          location.hash = hash;
        }, new URL(url).hash);
      await expect(page).toHaveURL(url);
    }
    await expect(page.locator(".platform-answer")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThan(position - 20);
    expect(await page.evaluate(() => scrollY)).toBeLessThan(position + 20);
    if (action === "focus") {
      // A real newer revision must still be applied after the no-change refresh.
      await page.evaluate(
        async ({ id, questionId }) => {
          const envelope = await (await fetch("/api/preparation")).json();
          const saved = envelope.state.sessions[id];
          const nextId = "external-next";
          saved.snapshots[nextId] = {
            ...saved.snapshots[questionId],
            id: nextId,
            title: "Вопрос из другой вкладки",
          };
          saved.questionIds.push(nextId);
          saved.index = 1;
          saved.followupIndex = 0;
          const response = await fetch("/api/preparation", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              state: envelope.state,
              expectedRevision: envelope.revision,
            }),
          });
          if (!response.ok) throw Error("External update failed");
          window.dispatchEvent(new Event("focus"));
        },
        { id: session.id, questionId: question.id },
      );
      await expect(page.locator(".question-card h2")).toHaveText(
        "Вопрос из другой вкладки",
      );
    }
  });
}
