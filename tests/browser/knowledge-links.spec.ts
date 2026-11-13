import { test, expect } from "#tests/helpers/browser.ts";
import { mkdir } from "node:fs/promises";
import { headingId } from "#ui/entities/material/lib/markdown.ts";
import type { Router } from "vue-router";

type NavigationWindow = typeof window & {
  knowledgeNavigation: {
    entered: boolean;
    release: () => void;
    finished: Promise<void>;
  };
};

const sourceId = "Фронтенд/JavaScript/Навигация";
const targetId = "Фронтенд/JavaScript/Материал с пробелами";
const sourceText = `# Проверка учебной навигации
## На этой странице
[Локальный раздел](#На этой странице)
[Относительная заметка](<./Материал с пробелами.md#Пример>)
[[Фронтенд/Javascript/Материал с пробелами#Часть#Деталь|Вложенный раздел]]
[[Фронтенд/JavaScript/Материал с пробелами#Внутри ответа|Закрытый ответ]]
[Внешний источник](https://example.com)
[[HR и самопрезентация/03. Поведенческие ответы|Личная HR-заметка]]
[Резюме](../../Резюме/Личное.md)
[[Собеседования/02. Журнал проверки|Журнал проверки]]
[_meta](../../_meta/Служебное.md)
[Отсутствующий раздел](<./Материал с пробелами.md#Нет такого раздела>)
[[#Неизвестный раздел|Отсутствующий локальный якорь]]`;
const bank = {
  notes: [
    {
      id: sourceId,
      path: sourceId + ".md",
      title: "Проверка учебной навигации",
      category: "JavaScript",
      markdown: sourceText,
    },
    {
      id: targetId,
      path: targetId + ".md",
      title: "Учебный материал",
      category: "JavaScript",
      markdown:
        "# Учебный материал\n## Пример\nПояснение.\n## Часть\n### Деталь\nПодробности.\n> [!answer]- Ответ\n> ## Внутри ответа\n> Объяснение.",
    },
  ],
  questions: [],
  route: [],
  warnings: [],
};

test("returning navigation keeps a newly focused material link", async ({
  app: { base },
  page,
}) => {
  await page.route("**/api/knowledge", (route) =>
    route.fulfill({ json: bank }),
  );
  await page.goto(base + "/#/themes?note=" + encodeURIComponent(sourceId));
  await page
    .getByRole("link", { name: "Локальный раздел", exact: true })
    .click();
  await expect(page.locator("#platformMain")).toBeFocused();

  // Hold navigation after its guards started, before the route watcher runs.
  // This reproduces focus chosen during navigation without a timing-based sleep.
  await page.evaluate(() => {
    const root = document.getElementById("__nuxt") as HTMLElement & {
      __vue_app__: { config: { globalProperties: { $router: Router } } };
    };
    const router = root.__vue_app__.config.globalProperties.$router;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished!: () => void;
    const state = {
      entered: false,
      release,
      finished: new Promise<void>((resolve) => {
        finished = resolve;
      }),
    };
    (window as NavigationWindow).knowledgeNavigation = state;
    const removeGuard = router.beforeResolve(async () => {
      state.entered = true;
      await gate;
      removeGuard();
    });
    const removeAfter = router.afterEach(() => {
      removeAfter();
      finished();
    });
  });
  await page.goBack();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as NavigationWindow).knowledgeNavigation.entered,
      ),
    )
    .toBe(true);
  const link = page.getByRole("link", {
    name: "Относительная заметка",
    exact: true,
  });
  await link.focus();
  await page.evaluate(async () => {
    const state = (window as NavigationWindow).knowledgeNavigation;
    state.release();
    await state.finished;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Учебный материал", exact: true }),
  ).toBeVisible();
});

test("knowledge links", async ({ app: { base }, browser }) => {
  await mkdir("artifacts/final-check", { recursive: true });

  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/knowledge", (route) =>
      route.fulfill({ json: bank }),
    );
    const origin = base + "/#/themes?note=" + encodeURIComponent(sourceId);
    await page.goto(origin);
    await page.locator(".platform-note h1").waitFor();
    await expect(page.locator(".unavailable-link")).toHaveCount(6);
    for (const unavailable of await page.locator(".unavailable-link").all()) {
      expect(
        (await unavailable.innerText()).includes(
          "недоступно в учебном каталоге",
        ),
      ).toBeTruthy();
      await expect(unavailable.locator("a")).toHaveCount(0);
      expect(await unavailable.getAttribute("tabindex")).toBe(null);
    }
    expect(
      await page
        .getByRole("link", { name: "Внешний источник", exact: true })
        .getAttribute("href"),
    ).toBe("https://example.com");
    await page
      .getByRole("link", { name: "Локальный раздел", exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        new URLSearchParams(url.hash.split("?")[1]).get("heading") ===
        "На этой странице",
    );
    await page.goBack();
    await expect(page).toHaveURL(
      (url) => !new URLSearchParams(url.hash.split("?")[1]).has("heading"),
    );
    await expect(page.locator("#platformMain")).toBeFocused();
    await page.locator(".platform-note h1").waitFor();
    for (const [name, heading] of [
      ["Относительная заметка", "Пример"],
      ["Вложенный раздел", "Часть#Деталь"],
      ["Закрытый ответ", "Внутри ответа"],
    ]) {
      const link = page.getByRole("link", { name, exact: true });
      await link.press("Enter");
      await expect(
        page.getByRole("heading", { name: "Учебный материал", exact: true }),
      ).toBeVisible();
      const query = new URLSearchParams(page.url().split("?")[1]);
      expect(query.get("note")).toBe(targetId);
      expect(query.get("heading")).toBe(heading);
      expect(
        await page.evaluate(
          (id) => Boolean(document.getElementById(id)),
          headingId(heading),
        ),
      ).toBeTruthy();
      if (name === "Закрытый ответ")
        expect(
          await page
            .locator(".md-callout")
            .evaluate((el) => (el as HTMLDetailsElement).open),
        ).toBeTruthy();
      await page.locator("[data-action=back]").click();
      await page
        .getByRole("heading", {
          name: "Проверка учебной навигации",
          exact: true,
        })
        .waitFor();
    }
    await expect(
      page.getByRole("heading", { name: "Материал недоступен", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `artifacts/final-check/knowledge-links-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
    await context.close();
  }
  console.log(
    "PASS knowledge links browser: Markdown/wiki, relative and alias paths, anchors, closed answers, unavailable explanations, keyboard, back, desktop/mobile",
  );
});
