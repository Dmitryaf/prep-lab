import type { Knowledge, Note } from "./material.ts";
import { extractQuestions, headings } from "./markdown.ts";
import type { BundledManifest } from "./contracts.ts";

export function applyBundledManifest(
  knowledge: Knowledge,
  manifest: BundledManifest,
): Knowledge {
  const questions = knowledge.questions.map((question) => ({ ...question }));
  const byId = new Map(questions.map((question) => [question.id, question]));
  for (const [id, titles] of Object.entries(
    manifest.interviewFollowups || {},
  )) {
    const question = byId.get(id);
    if (
      !question ||
      new Set(titles).size !== titles.length ||
      titles.some((title) => !question.followups.includes(title))
    )
      throw new Error(`Некорректные базовые уточнения: ${id}`);
    question.interviewFollowups = [...titles];
  }
  for (const id of manifest.interviewDiagnostics || []) {
    const question = byId.get(id);
    if (
      !question ||
      question.kind !== "practice" ||
      !question.answer.trim() ||
      !question.criteria.trim()
    )
      throw new Error(`Некорректный диагностический сценарий: ${id}`);
    question.interviewDiagnostic = true;
  }
  return { ...knowledge, questions, profiles: manifest.profiles };
}

export function compileKnowledge(notes: Note[]): Knowledge {
  const warnings: string[] = [];
  const questions = notes.flatMap((note) => extractQuestions(note)),
    ids = new Set(questions.map((question) => question.id));
  const routeNote = notes.find(
    (note) => note.path === "Собеседования/01. Основной маршрут.md",
  );
  const route: string[] = [];
  for (const line of (routeNote?.markdown || "").split(/\r?\n/)) {
    const match = /^\d+\.\s+\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(line);
    if (!match) continue;
    const id = "ck:" + match[1].replace(/\.md(?=#|$)/, "");
    if (ids.has(id)) route.push(id);
    else warnings.push(`Не найден пункт основного маршрута: ${match[1]}`);
  }
  const coreIds = new Set(route),
    byNote = new Map(notes.map((note) => [note.id, note]));
  for (const question of questions) {
    question.curriculumTier = coreIds.has(question.id)
      ? "core"
      : ["React", "Angular", "RxJS", "SQL"].includes(question.category)
        ? "vacancy"
        : "extended";
    question.learningLinks = question.learningLinks!.filter((link) => {
      const target = byNote.get(link.noteId);
      const valid =
        target &&
        (!link.heading ||
          headings(target.markdown).some(
            (heading) => heading.title === link.heading,
          ));
      if (!valid)
        warnings.push(
          `Не найдена учебная ссылка: ${question.title} → ${link.noteId}#${link.heading}`,
        );
      return valid;
    });
  }
  if (!notes.length)
    warnings.push(
      "В выбранной папке не найдены разрешённые учебные материалы.",
    );
  return { notes, questions, route, warnings };
}
