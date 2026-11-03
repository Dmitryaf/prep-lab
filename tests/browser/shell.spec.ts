import { test, expect } from "../helpers/browser.ts";

test("Nuxt shell declares its icon and opens the interview route", async ({
  app: { base },
  page,
  request,
}) => {
  await page.goto(base);
  await expect(
    page.getByRole("navigation", { name: "Основные разделы" }),
  ).toBeVisible();
  await expect(page.locator("[data-action=daily]")).toBeEnabled();
  await expect(
    page.locator('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveAttribute("href", "/favicon.svg");
  const icon = await request.get(base + "/favicon.svg");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  const bank = await (await request.get(base + "/api/knowledge")).json();
  const question = bank.questions[0];
  await page.goto(
    base +
      "/#" +
      new URLSearchParams({ view: "practice", question: question.id }),
  );
  await expect(
    page.getByRole("heading", { name: question.title, exact: true }),
  ).toBeVisible();
});
