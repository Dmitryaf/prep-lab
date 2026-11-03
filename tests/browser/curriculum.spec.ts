import { readProgress } from "../helpers/browser-progress.ts";
import { required } from "../helpers/values.ts";
import type { Knowledge } from "../../domain/knowledge/material.ts";
import type { Progress } from "../../domain/interview/state.ts";
import { knowledgeForProfile } from "../../domain/knowledge/profile.ts";

import { test, expect } from "../helpers/browser.ts";
import { mkdir, writeFile } from "node:fs/promises";

test("curriculum", async ({ app: { base }, page, pageErrors: errors }) => {
  // Readiness check for the reviewed curriculum, using the real knowledge API and UI.

  const destination = (q: Knowledge["questions"][number]) =>
    base + "/#" + new URLSearchParams({ view: "practice", question: q.id });
  const state = async () => JSON.stringify(await readProgress(page));
  await mkdir("artifacts/core-review-20261028", { recursive: true });
  try {
    const bank = knowledgeForProfile(
      await (await fetch(base + "/api/knowledge")).json(),
      "vue",
    );
    expect(bank.warnings).toEqual([]);
    expect(bank.route.length).toBe(66);
    const questions = bank.route.map((id) =>
      bank.questions.find((q) => q.id === id),
    );
    await page.goto(base);
    await page.locator("[data-action=daily]:enabled").waitFor();
    const before = await state();
    let links = 0;
    const checked = [];
    for (let i = 0; i < questions.length; i++) {
      const q = required(questions[i]);
      expect(
        q.answer &&
          q.criteria &&
          q.learningLinks?.some((l) => l.kind === "theory"),
        q.title,
      ).toBeTruthy();
      await page.goto(destination(q));
      await page.getByRole("heading", { name: q.title, exact: true }).waitFor();
      await expect(page.locator(".platform-answer"), q.title).toHaveCount(0);
      await page.locator("[data-action=reveal]").click();
      const answer = await page.locator(".platform-answer").innerText();
      expect(answer.includes("Проверьте себя"), q.title).toBeTruthy();
      expect(
        answer.includes(q.criteria.replace(/`/g, "")),
        q.title,
      ).toBeTruthy();
      for (const link of q.learningLinks) {
        const expected = required(bank.notes.find((n) => n.id === link.noteId));
        expect(expected, q.title).toBeTruthy();
        const prefix =
          link.kind === "theory" ? "Изучить тему" : "Решить задачу";
        await page
          .getByRole("link", {
            name: `${prefix}: ${expected.title}`,
            exact: true,
          })
          .click();
        await page.locator(".platform-note").waitFor();
        const r = new URLSearchParams(
          new URL(page.url()).hash.split("?")[1] || "",
        );
        expect(r.get("note")).toBe(link.noteId);
        expect(r.get("heading") || "").toBe(link.heading || "");
        expect(
          (await page.locator(".platform-note").innerText()).length > 100,
        ).toBeTruthy();
        links++;
        await page.goto(destination(q));
        await page.locator("[data-action=reveal]").click();
      }
      if ([0, 15, 49, 54, 65].includes(i)) {
        await page.setViewportSize({ width: 390, height: 844 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `mobile overflow: ${q.title}`,
        ).toBeTruthy();
        await page.screenshot({
          path: `artifacts/core-review-20261028/card-${i + 1}-mobile.png`,
          fullPage: true,
        });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      checked.push({
        id: q.id,
        title: q.title,
        hiddenBeforeReveal: true,
        criteria: true,
        links: q.learningLinks.length,
      });
      if ((i + 1) % 22 === 0)
        console.log(`Checked ${i + 1}/66 cards and ${links} learning links`);
    }
    expect(await state(), "reading should not change progress").toBe(before);
    // Study → mark a gap → repeat → independent retry can be marked confident.
    const q = required(questions[15]);
    await page.goto(destination(q));
    await page.locator("[data-action=reveal]").click();
    expect(
      (await page.locator(".platform-answer").innerText()).includes(
        "[2, 1, 3]",
      ),
    ).toBeTruthy();
    await page.locator("[data-rating=partial]").click();
    await page.locator('#platformNav a[href="#/repeat"]').click();
    await page.getByRole("link").filter({ hasText: q.title }).click();
    await page.locator("[data-action=reveal]").click();
    await page.locator("[data-rating=done]").click();
    await page.locator('#platformNav a[href="#/repeat"]').click();
    await expect(page.locator(".platform-list-row")).toHaveCount(0);
    const saved: Progress = JSON.parse(required(await state()));
    expect(saved.questionProgress[q.id].status).toBe("done");
    await page.reload();
    expect(JSON.parse(required(await state()))).toEqual(saved);
    expect(errors).toEqual([]);
    await writeFile(
      "artifacts/core-review-20261028/browser-evidence.json",
      JSON.stringify(
        { cards: checked, links, errors, repeatAndReload: true },
        null,
        2,
      ),
    );
    console.log(
      `PASS core curriculum: 66 hidden/revealed answers, criteria, ${links} live study links, 5 narrow layouts, repeat/reload, no reading-side progress changes`,
    );
  } catch (error) {
    await page.screenshot({
      path: "artifacts/core-review-20261028/failure.png",
      fullPage: true,
    });
    throw error;
  }
});
