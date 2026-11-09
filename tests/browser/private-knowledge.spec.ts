import { test as baseTest, expect } from "#tests/helpers/browser.ts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cleanTest = baseTest.extend({
  appOptions: [
    { projectPackageRoot: null, knowledgeRoot: resolve("content/common") },
    { option: true },
  ],
});
cleanTest(
  "a clean instance exposes only shared materials",
  async ({ app: { base }, page, request }) => {
    const bank = await (await request.get(base + "/api/knowledge")).json();
    expect(
      bank.notes.some((note: { path: string }) =>
        note.path.startsWith("HR и самопрезентация/"),
      ),
    ).toBe(false);
    await page.goto(base + "/#/themes");
    await expect(
      page.getByRole("heading", { name: "Темы", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".platform-note")).toHaveCount(0);
  },
);

const privateTest = baseTest.extend<{ vault: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture dependency signature.
  vault: async ({}, use) => {
    const root = await mkdtemp(join(tmpdir(), "private-vault-browser-"));
    try {
      await mkdir(join(root, "Личные материалы"));
      await writeFile(
        join(root, "Личные материалы/Заметка.md"),
        "# Личная заметка\n\n## Мой вопрос\nСохранённое личное пояснение.",
      );
      await writeFile(
        join(root, "private-notes.json"),
        JSON.stringify([
          {
            path: "Личные материалы/Заметка.md",
            headingAliases: { "Старое название": "Мой вопрос" },
          },
        ]),
      );
      await use(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  appOptions: async ({ vault }, use) => {
    await use({ projectPackageRoot: null, knowledgeRoot: vault });
  },
});
privateTest(
  "personal notes and old headings remain available after reload",
  async ({ app: { base }, page, request }) => {
    const bank = await (await request.get(base + "/api/knowledge")).json();
    const own = bank.notes.filter(
      (note: { id: string }) => note.id === "Личные материалы/Заметка",
    );
    expect(own).toHaveLength(1);
    expect(own[0].headingAliases["Старое название"]).toBe("Мой вопрос");
    const path =
      "/#/themes?note=" +
      encodeURIComponent("Личные материалы/Заметка") +
      "&heading=" +
      encodeURIComponent("Старое название");
    await page.goto(base + path);
    await expect(page.locator(".platform-note")).toContainText(
      "Сохранённое личное пояснение.",
    );
    await page.reload();
    await expect(page.locator(".platform-note")).toContainText(
      "Сохранённое личное пояснение.",
    );
  },
);
