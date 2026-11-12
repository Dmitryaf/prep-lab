import { expect, type Page } from "@playwright/test";
import type { Interview } from "#domain/interview/state.ts";

export async function expectCompactReview(
  page: Page,
  session: Pick<Interview, "questionIds" | "snapshots">,
) {
  const rows = page.locator('[data-action="result-toggle"]');
  await expect(rows).toHaveCount(session.questionIds.length);
  await expect(page.locator(".platform-answer")).toHaveCount(0);
  for (const [index, id] of session.questionIds.entries()) {
    await rows.nth(index).click();
    await expect(rows.nth(index)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".question-card h2")).toHaveText(
      session.snapshots[id].title,
    );
    await expect(page.locator(".platform-answer")).toHaveCount(1);
    await expect(page.locator(".platform-answer")).toContainText(/\S/);
  }
}
