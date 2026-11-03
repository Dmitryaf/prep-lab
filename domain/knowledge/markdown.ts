import type { Note } from "./material.ts";
import type { PreparedQuestion, StudyLink } from "./question.ts";
import { canonicalNotePath } from "./path.ts";
interface Heading {
  title: string;
  level: number;
  start: number;
  parents: string[];
  end: number;
  ownEnd: number;
  body: string;
}
type ParsedQuestion = PreparedQuestion & {
  _start: number;
  _end: number;
  followups: string[];
  learningLinks: StudyLink[];
};
export function stripFrontmatter(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
}
export function headings(markdown: string) {
  let fence: string | null = null;
  const lines = stripFrontmatter(markdown).split(/\r?\n/),
    result: Heading[] = [],
    stack: Heading[] = [];
  lines.forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length)
        fence = null;
      return;
    }
    if (fence) return;
    const m = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (!m) return;
    const level = m[1].length,
      title = m[2].replace(/`/g, "").trim();
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    const entry: Heading = {
      end: 0,
      ownEnd: 0,
      body: "",
      title,
      level,
      start: index,
      parents: stack.map((p) => p.title),
    };
    result.push(entry);
    stack.push(entry);
  });
  for (let i = 0; i < result.length; i++) {
    const h = result[i];
    h.end =
      result.slice(i + 1).find((n) => n.level <= h.level)?.start ??
      lines.length;
    h.ownEnd = result[i + 1]?.start ?? lines.length;
    h.body = lines.slice(h.start + 1, h.ownEnd).join("\n");
  }
  return result;
}
export function categoryFor(path: string, heading: string = "") {
  const name = path.split("/").at(-1)!.replace(/\.md$/, "");
  const section = canonicalNotePath(path).split("/")[1];
  if (
    path.startsWith("Фронтенд/") &&
    ["JavaScript", "TypeScript", "Vue", "React", "Angular", "RxJS"].includes(
      section,
    )
  )
    return section;
  if (/^Фронтенд\/(API браузера|HTML и CSS)\//.test(path))
    return "Браузер, HTML и CSS";
  if (/^(JavaScript|TypeScript|Vue|React|Angular|RxJS)$/.test(name))
    return name;
  if (/Браузер|HTML|CSS|DOM|Интерфейс/.test(name)) return "Браузер, HTML и CSS";
  if (/Сети|Безопасность/.test(name)) return "Сети и безопасность";
  if (/Тестирование/.test(name) || /тестир/i.test(heading))
    return "Тестирование";
  if (/Архитектура|Проектирование/.test(path))
    return "Архитектура, производительность и тестирование";
  if (/Поведенческие|HR и самопрезентация/.test(path))
    return "Поведенческие вопросы";
  if (path.startsWith("Опыт и проекты/")) return "Собственные проекты";
  if (/Алгоритмы/.test(name)) return "JavaScript";
  if (/SQL|Базы данных/.test(name)) return "SQL";
  return "Инженерные вопросы";
}
function separateBody(body: string) {
  const learningLinks: StudyLink[] = [];
  for (const match of body.matchAll(
    /^\*\*(Изучить|Практика)(?: (Vue|React))?:\*\*[^\n]*$/gm,
  )) {
    for (const link of match[0].matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
      const [noteId, ...parts] = link[1].replace(/\.md(?=#|$)/, "").split("#");
      learningLinks.push({
        kind: match[1] === "Изучить" ? "theory" : "practice",
        noteId,
        heading: parts.join("#"),
        label: link[2] || noteId.split("/").at(-1)!,
        ...(match[2]
          ? {
              profiles: [
                match[2] === "Vue" ? ("vue" as const) : ("react" as const),
              ],
            }
          : {}),
      });
    }
  }
  const criteria =
    /^\*\*Критерии ответа:\*\*\s*([^\n]+)/m.exec(body)?.[1] || "";
  body = body.replace(
    /^\*\*(?:(?:Изучить|Практика)(?: (?:Vue|React))?|Критерии ответа):\*\*[^\n]*\n?/gm,
    "",
  );
  const lines = body.split("\n");
  const at = lines.findIndex((l) =>
    /^>\s*\[!(answer|example|question)\]/i.test(l),
  );
  const followups: string[] = [];
  let inFollowups = false,
    fence = false;
  for (const line of lines) {
    if (/^>/.test(line)) continue;
    if (/^\s*```/.test(line)) fence = !fence;
    if (fence) continue;
    if (/^\*\*Уточнения\*\*/.test(line)) {
      inFollowups = true;
      continue;
    }
    if (inFollowups && /^[-*] /.test(line))
      followups.push(line.replace(/^[-*] /, ""));
    else if (inFollowups && line.trim()) inFollowups = false;
  }
  let end = at + 1;
  if (at >= 0) while (end < lines.length && /^>/.test(lines[end])) end++;
  const shortAnswer =
    at < 0
      ? ""
      : lines
          .slice(at + 1, end)
          .join("\n")
          .replace(/^> ?/gm, "")
          .trim();
  return {
    before: (at < 0 ? body : lines.slice(0, at).join("\n")).trim(),
    shortAnswer,
    answer:
      at < 0
        ? ""
        : lines
            .slice(at)
            .join("\n")
            .replace(/^>\s*\[!(?:answer|example|question)\][-+]?[^\n]*\n/gm, "")
            .replace(/^> ?/gm, "")
            .trim(),
    followups,
    learningLinks,
    criteria,
  };
}
export function extractQuestions(
  note: Pick<Note, "id" | "path" | "markdown">,
  kindOverride?: "theory" | "practice" | "design" | "behavioral",
): PreparedQuestion[] {
  const kind =
    kindOverride ||
    (note.path.startsWith("Собеседования/Темы/")
      ? note.path.includes("Поведенческие")
        ? "behavioral"
        : "theory"
      : note.path.startsWith("Собеседования/Практика/")
        ? "practice"
        : note.path.startsWith("Собеседования/Проектирование/")
          ? "design"
          : null);
  if (!kind) return [];
  const hs = headings(note.markdown),
    result: ParsedQuestion[] = [],
    counts = new Map();
  const structural =
    /^(Условие|Дополнительные условия|Решение|Разбор|Критерии(?: проверки)?|Проверка решения)$/i;
  const lines = stripFrontmatter(note.markdown).split(/\r?\n/);
  for (const h of hs) counts.set(h.title, (counts.get(h.title) || 0) + 1);
  for (const h of hs) {
    if (h.level < 2 || structural.test(h.title)) continue;
    const children = hs.filter((c) => c.start > h.start && c.start < h.end);
    const structuralChildren =
      children.length && children.every((c) => structural.test(c.title));
    const split = separateBody(
      structuralChildren ? lines.slice(h.start + 1, h.end).join("\n") : h.body,
    );
    // Introductory design instructions and grouping headings are not tasks.
    if (
      !split.answer &&
      (kind === "theory" ||
        kind === "behavioral" ||
        (children.length && !structuralChildren))
    )
      continue;
    if (
      !split.answer &&
      /^(Как проводить|Требования и ограничения|Короткий и полный|Порядок|Перед началом|Общие|Критерии)/i.test(
        h.title,
      )
    )
      continue;
    if (!split.answer && split.before.length < 30) continue;
    const heading =
      counts.get(h.title) > 1
        ? [...h.parents.slice(1), h.title].join("#")
        : h.title;
    result.push({
      id: `ck:${note.id}#${heading}`,
      source: "knowledge",
      kind,
      category: categoryFor(note.path, h.title),
      title: h.title,
      prompt: ["theory", "behavioral"].includes(kind)
        ? h.title
        : `${h.title}\n\n${split.before}`,
      answer: split.answer,
      shortAnswer: split.shortAnswer,
      availableAnswer: !!split.answer,
      noteId: note.id,
      heading,
      followups: split.followups,
      learningLinks: split.learningLinks,
      criteria: split.criteria,
      _start: h.start,
      _end: h.end,
    });
  }
  for (const q of result) {
    const parent = result
      .filter((p) => p._start < q._start && p._end > q._start)
      .at(-1);
    if (parent) {
      q.parentId = parent.id;
      if (!parent.followups.includes(q.title)) parent.followups.push(q.title);
    }
  }
  for (const q of result)
    q.followupAnswers = result
      .filter((child) => child.parentId === q.id)
      .map((child) => ({ title: child.title, answer: child.answer }));
  return result.map(({ _start, _end, ...q }) => q);
}
