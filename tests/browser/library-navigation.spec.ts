import { readFileSync } from "node:fs";
import { test, expect } from "#tests/helpers/browser.ts";
import type { Note } from "#domain/knowledge/material.ts";

const labId = "Фронтенд/Практикумы/00. Карта раздела";
const oldText = readFileSync(
  new URL("../fixtures/legacy-lab-index.txt", import.meta.url),
  "utf8",
);
function note(id: string, title: string, markdown: string): Note {
  return {
    id,
    title,
    markdown,
    path: id.replace(/^bundled-rounds\//, "") + ".md",
    category: "Инженерные вопросы",
    ...(id.startsWith("bundled-rounds/") ? { sourceId: "bundled-rounds" } : {}),
  };
}

test("library shows one current lab entry and retains hidden direct and scoped links", async ({
  app: { base },
  page,
}, testInfo) => {
  const notes = [
    note(labId, "Практикумы", oldText),
    note(
      "bundled-rounds/" + labId,
      "Практикумы",
      "# Практикумы\n\nОткройте запускаемые стенды для исследования состояния интерфейса.\n\n[[Фронтенд/00. Карта раздела|Учебная карта]]",
    ),
    note(
      "Фронтенд/00. Карта раздела",
      "Фронтенд",
      "# Прежняя карта\n\nПрежняя учебная карта остаётся доступна по прямому адресу.",
    ),
    note(
      "bundled-rounds/Фронтенд/00. Карта раздела",
      "Фронтенд",
      "# Текущая карта\n\nТекущая учебная карта используется ссылками общих материалов.",
    ),
    note(
      "Фронтенд/Внешние материалы",
      "Внешние материалы",
      "# Внешние материалы\n\nСписок дополнительных ссылок доступен по сохранённому адресу.",
    ),
    note(
      "bundled-rounds/Фронтенд/Внешние материалы",
      "Внешние материалы",
      "# Внешние материалы\n\nСписок дополнительных ссылок доступен из общих материалов.",
    ),
    note(
      "Фронтенд/Моя карта",
      "Собственный маршрут",
      "# Собственный маршрут\n\nЭтот самостоятельный материал нельзя скрывать вместе с общей картой.",
    ),
  ];
  await page.route("**/api/knowledge", (route) =>
    route.fulfill({ json: { notes, questions: [], route: [], warnings: [] } }),
  );
  await page.goto(base + "/#/themes");
  await expect(
    page.getByRole("link", { name: "Собственный маршрут", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".knowledge-subgroup > summary")).toHaveText([
    "Практикумы 1 материал",
  ]);
  await page.locator(".knowledge-subgroup > summary").click();
  const labs = page.getByRole("link", {
    name: "Стенды и упражнения",
    exact: true,
  });
  await expect(labs).toHaveCount(1);
  await expect(page.locator(".knowledge-group").getByRole("link")).toHaveCount(
    2,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: testInfo.outputPath(`library-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await labs.click();
  await expect(
    page.getByText(
      "Откройте запускаемые стенды для исследования состояния интерфейса.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Учебная карта", exact: true }).click();
  await expect(page.locator(".platform-note h1")).toHaveText("Текущая карта");
  await page.goto(
    base + "/#/themes?note=" + encodeURIComponent("Фронтенд/00. Карта раздела"),
  );
  await expect(page.locator(".platform-note h1")).toHaveText("Прежняя карта");
  await page.goto(base + "/#/themes?note=" + encodeURIComponent(labId));
  await expect(page.locator(".platform-note h1")).toHaveText("Практикумы");
  await expect(page.locator(".platform-note")).not.toContainText(
    "успешный запуск сам по себе не подтверждает самостоятельное решение",
  );
  await expect(page.locator(".platform-note")).toContainText(
    "labs/request-lifecycle/",
  );
});
