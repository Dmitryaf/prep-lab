import {
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  lstatSync,
} from "node:fs";
import { resolve, sep } from "node:path";
import type { Knowledge } from "../../../domain/knowledge/material.ts";
import { categoryFor } from "../../../domain/knowledge/markdown.ts";
import { compileKnowledge } from "../../../domain/knowledge/catalog.ts";
const folders = [
  "Собеседования/Темы",
  "Собеседования/Практика",
  "Собеседования/Проектирование",
  "Фронтенд",
  "Опыт и проекты",
];
const singles = [
  "Собеседования/00. Карта раздела.md",
  "Собеседования/01. Основной маршрут.md",
  ...[
    "06. Популярные вопросы HR",
    "07. Вопросы HR — Назаров, часть 1",
    "08. Вопросы HR — Назаров, часть 2",
  ].map((s) => `HR и самопрезентация/${s}.md`),
];
const excluded = new Set([
  "AGENTS.md",
  "node_modules",
  "labs",
  "_archive",
  "_meta",
]);
export function allowedKnowledgePath(path: unknown) {
  if (
    typeof path !== "string" ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((p) => p.startsWith(".") || excluded.has(p))
  )
    return false;
  return (
    path.endsWith(".md") &&
    (singles.includes(path) || folders.some((f) => path.startsWith(f + "/")))
  );
}
export function loadKnowledge(root: string): Knowledge {
  const base = realpathSync(resolve(root));
  if (!statSync(base).isDirectory()) throw new Error("База знаний недоступна");
  const paths = new Set<string>();
  function walk(path: string) {
    const absolute = resolve(base, path);
    let entry;
    try {
      entry = lstatSync(absolute);
    } catch {
      return;
    }
    if (entry.isSymbolicLink()) return;
    const actual = realpathSync(absolute);
    if (!actual.startsWith(base + sep)) return;
    // lstat on a leaf does not reveal a junction in its parent. Reject aliases
    // even when they point into the vault: a public folder must not expose private files.
    const normalize = (p: string) =>
      process.platform === "win32" ? p.toLowerCase() : p;
    if (normalize(actual) !== normalize(absolute)) return;
    if (entry.isDirectory()) {
      for (const child of readdirSync(absolute))
        if (!child.startsWith(".") && !excluded.has(child))
          walk(`${path}/${child}`);
    } else if (entry.isFile() && allowedKnowledgePath(path)) paths.add(path);
  }
  for (const folder of folders) walk(folder);
  for (const single of singles) walk(single);
  const notes = [...paths].sort().map((path) => {
    const markdown = readFileSync(resolve(base, path), "utf8");
    const title =
      /^title:\s*["']?(.+?)["']?\s*$/m.exec(markdown)?.[1] ||
      /^# (.+)$/m.exec(markdown)?.[1] ||
      path.split("/").at(-1)!.replace(/\.md$/, "");
    return {
      id: path.replace(/\.md$/, ""),
      path,
      title,
      markdown,
      category: categoryFor(path),
    };
  });
  return compileKnowledge(notes);
}
