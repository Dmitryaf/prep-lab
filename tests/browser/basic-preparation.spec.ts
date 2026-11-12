import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { test, expect } from "#tests/helpers/browser.ts";
import {
  readProgress,
  restoreProgressFixture,
} from "#tests/helpers/browser-progress.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { knowledgeForProfile } from "#domain/knowledge/profile.ts";
import { createSession } from "#domain/interview/selection.ts";
import { loadState } from "#domain/interview/saved-state.ts";

test.use({
  appOptions: {
    projectPackageRoot: null,
    knowledgeRoot: resolve("content/common"),
  },
});

const common = loadCommonKnowledge();
const sessions = [
  { profile: "vue", width: 1440, height: 1000 },
  { profile: "react", width: 390, height: 844 },
  { profile: "react", width: 1280, height: 900 },
] as const;

for (const viewport of sessions) {
  test(`complete mixed interview: ${viewport.profile}, ${viewport.width}px, 20 questions and ready followups`, async ({
    app: { base },
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const bank = knowledgeForProfile(common, viewport.profile);
    const session = createSession(
      bank.questions,
      "full",
      {},
      viewport.profile,
      "mixed",
    );
    expect(session.questionIds).toHaveLength(20);
    const snapshots = structuredClone(session.snapshots);
    const state = loadState({ getItem: () => null });
    state.sessions[session.id] = session;
    state.activeSession = session.id;
    const modelRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        /\/api\/(study-chat|assistant)/.test(request.url())
      )
        modelRequests.push(request.url());
    });

    await page.goto(base + "/#/interview");
    await page.locator("#preparationProfile").selectOption(viewport.profile);
    await expect(page.locator("#platformMain")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await restoreProgressFixture(page, state);
    await page.goto(
      base + "/#/interview?" + new URLSearchParams({ session: session.id }),
    );
    await expect(page.locator("#preparationProfile")).toHaveValue(
      viewport.profile,
    );

    const observations: {
      id: string;
      title: string;
      kind: string;
      category: string;
      stages: string[];
      followup?: string;
      answerCharacters: number;
      followupAnswerCharacters?: number;
    }[] = [];
    for (const [index, id] of session.questionIds.entries()) {
      const question = snapshots[id]!;
      await expect(page.locator(".question-card h2")).toHaveText(
        question.title,
      );
      await expect(page.locator(".platform-answer")).toHaveCount(0);
      const observed: (typeof observations)[number] = {
        id,
        title: question.title,
        kind: question.kind,
        category: question.category,
        stages: ["main-hidden"],
        answerCharacters: 0,
      };
      if (index === 0 || index === 10)
        await page.screenshot({
          path: testInfo.outputPath(index === 0 ? "start.png" : "middle.png"),
          fullPage: true,
        });
      await page.locator('[data-action="session-review"]').click();
      await expect(page.locator(".platform-answer")).toBeVisible();
      observed.answerCharacters = (
        await page.locator(".platform-answer").innerText()
      ).trim().length;
      expect(observed.answerCharacters, question.title).toBeGreaterThan(0);
      observed.stages.push("main-revealed");

      const ready = (question.followups || []).filter((title) =>
        question.followupAnswers?.some(
          (answer) => answer.title === title && answer.answer.trim(),
        ),
      );
      if (ready.length) {
        await page.locator('[data-action="session-followup"]').first().click();
        const followup = page.locator(".followup-question");
        await expect(followup.locator("h3")).toBeVisible();
        observed.followup = await followup.locator("h3").innerText();
        expect(ready).toContain(observed.followup);
        await expect(page.locator(".platform-answer")).toHaveCount(0);
        observed.stages.push("followup-hidden");
        await page.locator('[data-action="followup-review"]').click();
        await expect(followup.locator(".platform-answer")).toBeVisible();
        observed.followupAnswerCharacters = (
          await followup.locator(".platform-answer").innerText()
        ).trim().length;
        expect(observed.followupAnswerCharacters).toBeGreaterThan(0);
        observed.stages.push("followup-revealed");
        await page.locator('[data-action="session-previous"]').click();
        await expect(page.locator(".followup-question")).toHaveCount(0);
        await expect(page.locator(".question-card h2")).toHaveText(
          question.title,
        );
        await expect(page.locator(".platform-answer")).toBeVisible();
        observed.stages.push("returned-to-main");
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `horizontal overflow: ${question.title}`,
      ).toBe(true);
      await page.locator('[data-action="session-next"]').click();
      observed.stages.push("advanced");
      observations.push(observed);
    }
    await expect(
      page.getByRole("heading", { name: "Разбор интервью", exact: true }),
    ).toBeVisible();
    const saved = (await readProgress(page)).sessions[session.id]!;
    expect(saved.finished).toBe(true);
    expect(saved.index).toBe(20);
    expect(saved.questionIds).toEqual(session.questionIds);
    expect(saved.snapshots).toEqual(snapshots);
    expect(saved.reviewed).toEqual(session.questionIds);
    expect(saved.skipped).toEqual([]);
    expect(modelRequests).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("end.png"),
      fullPage: true,
    });
    await writeFile(
      testInfo.outputPath("observations.json"),
      JSON.stringify(
        {
          evidence: "automated interface traversal, not learner performance",
          profile: viewport.profile,
          viewport,
          sessionId: session.id,
          finished: saved.finished,
          snapshotsUnchanged: true,
          questions: observations,
        },
        null,
        2,
      ),
    );
  });
}

test("the four published CSS examples satisfy their stated geometry", async ({
  page,
}, testInfo) => {
  const titles = {
    grid: "Почему перенос строк Flexbox не выравнивает колонки между строками?",
    flex: "Как min-width: 0 помогает полю поиска в узкой flex-панели?",
    container:
      "Как проверить карточку, которая используется и на странице, и в узкой панели?",
    height: "Почему фиксированная высота часто ломается при увеличении текста?",
  };
  const styles = Object.entries(titles).map(([kind, title]) => {
    const answer = common.questions
      .flatMap((question) => question.followupAnswers || [])
      .find((followup) => followup.title === title)?.answer;
    expect(answer, title).toBeTruthy();
    const css = answer!.match(/~~~css\n([\s\S]*?)\n~~~/)?.[1];
    expect(css, title).toBeTruthy();
    return { kind, title, css: css! };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; font: 16px/1.4 sans-serif; }
    .fixture { margin-bottom: 2rem; }
    ${styles.map((item) => item.css).join("\n")}
  </style></head><body>
    <div class="fixture toolbar" style="width: 500px">
      <label class="search"><input aria-label="Поиск" value="Очень длинный поисковый запрос с дополнительными словами"></label>
      <button>Найти</button>
    </div>
    <div class="fixture cards" style="width: 600px">
      <div>Первая карточка с длинным заголовком</div><div>Вторая</div><div>Третья</div><div>Четвёртая</div><div>Пятая</div>
    </div>
    <div id="wide" class="fixture card-host" style="width: 800px"><article class="card"><div>Изображение</div><div>Текст карточки</div></article></div>
    <div id="narrow" class="fixture card-host" style="width: 280px"><article class="card"><div>Изображение</div><div>Текст карточки</div></article></div>
    <div class="fixture notice" style="width: 220px">Сохранение пока недоступно. Проверьте обязательные поля и повторите отправку формы.</div>
  </body></html>`);
  const rect = async (selector: string) => {
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds, selector).not.toBeNull();
    return bounds!;
  };
  const inputWide = await rect(".search input");
  await page.locator(".toolbar").evaluate((element) => {
    (element as HTMLElement).style.width = "220px";
  });
  const inputNarrow = await rect(".search input");
  const toolbar = await rect(".toolbar");
  const button = await rect(".toolbar button");
  expect(inputNarrow.width).toBeLessThan(inputWide.width);
  expect(inputNarrow.width).toBeGreaterThan(0);
  expect(inputNarrow.x + inputNarrow.width).toBeLessThanOrEqual(button.x);
  expect(button.x + button.width).toBeLessThanOrEqual(
    toolbar.x + toolbar.width + 1,
  );
  expect(
    await page
      .locator(".toolbar")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);

  const grid = await Promise.all(
    [1, 2, 3, 4, 5].map((index) => rect(`.cards > :nth-child(${index})`)),
  );
  expect(grid[3]!.x).toBeCloseTo(grid[0]!.x, 1);
  expect(grid[4]!.x).toBeCloseTo(grid[1]!.x, 1);
  expect(grid[3]!.width).toBeCloseTo(grid[0]!.width, 1);
  expect(grid[3]!.y).toBeGreaterThan(grid[0]!.y);
  const wide = await Promise.all(
    [1, 2].map((index) => rect(`#wide .card > :nth-child(${index})`)),
  );
  const narrow = await Promise.all(
    [1, 2].map((index) => rect(`#narrow .card > :nth-child(${index})`)),
  );
  expect(wide[0]!.y).toBeCloseTo(wide[1]!.y, 1);
  expect(wide[1]!.x).toBeGreaterThan(wide[0]!.x);
  expect(narrow[1]!.y).toBeGreaterThanOrEqual(narrow[0]!.y + narrow[0]!.height);
  expect(narrow[0]!.x).toBeCloseTo(narrow[1]!.x, 1);

  const normalText = await rect(".notice");
  await page.locator(".notice").evaluate((element) => {
    (element as HTMLElement).style.fontSize = "32px";
  });
  const largeText = await rect(".notice");
  expect(largeText.height).toBeGreaterThan(normalText.height);
  expect(
    await page
      .locator(".notice")
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("css-examples.png"),
    fullPage: true,
  });
  await writeFile(
    testInfo.outputPath("css-geometry.json"),
    JSON.stringify(
      {
        examples: styles,
        inputWide,
        inputNarrow,
        toolbar,
        button,
        grid,
        wide,
        narrow,
        normalText,
        largeText,
      },
      null,
      2,
    ),
  );
});
