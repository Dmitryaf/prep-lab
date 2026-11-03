import { importState } from "../../domain/interview/engine.ts";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { Progress } from "../../domain/interview/state.ts";

export async function readProgress(page: Page): Promise<Progress> {
  await expect(page.locator("#platformMain")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  return page.evaluate(async () => {
    const response = await fetch("/api/preparation");
    if (!response.ok)
      throw new Error("Не удалось прочитать тестовое состояние экземпляра.");
    const envelope = await response.json();
    return envelope.state as Progress;
  });
}

// Fixture writes use the same validator, revision check and transaction as UI writes.
export async function restoreProgressFixture(page: Page, value: unknown) {
  const current = await readProgress(page);
  const next = importState(
    typeof value === "string" ? value : JSON.stringify(value),
    current,
  );
  await page.evaluate(async (state) => {
    const before = await (await fetch("/api/preparation")).json();
    const response = await fetch("/api/preparation", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, expectedRevision: before.revision }),
    });
    if (!response.ok) throw new Error("Тестовый снимок не принят.");
  }, next);
  await page.reload();
  await expect(page.locator("#platformMain")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.locator("#platformMain h1").waitFor();
}
