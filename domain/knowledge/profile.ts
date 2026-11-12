import type { Knowledge, Note } from "./material.ts";
import type { Question } from "./question.ts";
import { headings, stripFrontmatter } from "./markdown.ts";

export type StackProfile = "vue" | "react";
const vue =
  /\bVue\b|\bVuex\b|\bPinia\b|\bNuxt\b|\.vue\b|(?:`{3,}|~{3,})vue\b|from\s+["']vue["']|\bdefineProps\b/;
const react =
  /\bReact\b|\bRedux\b|\bJSX\b|\buseState\b|\buseEffect\b|from\s+["']react(?:-dom)?(?:["'/])|\bNext\.js\b/;
const other = (profile: StackProfile) => (profile === "react" ? vue : react);
const foreignCategory = (category: string, profile: StackProfile) =>
  [profile === "react" ? "Vue" : "React", "Angular", "RxJS"].includes(category);

// References to optional reading do not make an otherwise general answer stack-specific.
function compatibleText(text: string, profile: StackProfile) {
  return text.replace(/\[\[([^\]]+)\]\]/g, (whole, target: string) => {
    if (!other(profile).test(target)) return whole;
    const label = target.split("|")[1];
    return label && !other(profile).test(label)
      ? label
      : "дополнительный разбор";
  });
}
function hasForeignCode(text: string, profile: StackProfile) {
  // Markdown answers may quote fenced examples. Inspect code rather than
  // treating an incidental framework name in the explanation as a requirement.
  const source = text.replace(/^\s*> ?/gm, "");
  return [...source.matchAll(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1/g)].some(
    (block) => other(profile).test(block[0]),
  );
}
export function supportsQuestion(question: Question, profile: StackProfile) {
  return (
    (!question.profiles || question.profiles.includes(profile)) &&
    !foreignCategory(question.category, profile) &&
    !other(profile).test(
      compatibleText(question.title + "\n" + question.prompt, profile),
    ) &&
    !hasForeignCode(
      [
        question.answer,
        question.shortAnswer,
        question.details,
        question.criteria,
      ].join("\n"),
      profile,
    )
  );
}
export function questionForProfile<T extends Question>(
  question: T,
  profile: StackProfile,
): T {
  const blocked = other(profile);
  return {
    ...question,
    answer: compatibleText(question.answer, profile),
    shortAnswer:
      question.shortAnswer === undefined
        ? undefined
        : compatibleText(question.shortAnswer, profile),
    prompt: compatibleText(question.prompt, profile),
    details:
      question.details === undefined
        ? undefined
        : compatibleText(question.details, profile),
    followups: question.followups?.filter((text) => !blocked.test(text)),
    ...(question.interviewFollowups === undefined
      ? {}
      : {
          interviewFollowups: question.interviewFollowups.filter(
            (text) => !blocked.test(text),
          ),
        }),
    followupAnswers: question.followupAnswers?.filter(
      (answer) => !blocked.test(answer.title + "\n" + answer.answer),
    ),
    learningLinks: question.learningLinks?.filter(
      (link) =>
        (!link.profiles || link.profiles.includes(profile)) &&
        !blocked.test(link.noteId + "\n" + link.label),
    ),
  };
}
function noteForProfile(note: Note, profile: StackProfile): Note | undefined {
  if (note.profiles && !note.profiles.includes(profile)) return;
  if (foreignCategory(note.category, profile)) return;
  if (other(profile).test(note.title)) return;
  const source = stripFrontmatter(note.markdown);
  const blocked = other(profile),
    sections = headings(source),
    lines = source.split(/\r?\n/);
  const omitted = new Set<number>();
  const omit = (start: number, end: number) => {
    for (let index = start; index < end; index++) omitted.add(index);
  };
  for (const heading of sections) {
    if (heading.level === 1) continue;
    if (blocked.test(heading.title)) {
      omit(heading.start, heading.end);
      continue;
    }
    if (hasForeignCode(heading.body, profile)) {
      const children = sections.some(
        (child) => child.start > heading.start && child.start < heading.end,
      );
      omit(heading.start + (children ? 1 : 0), heading.ownEnd);
    }
  }
  const firstSection =
    sections.find((heading) => heading.level >= 2)?.start ?? lines.length;
  // A foreign executable introduction makes this a stack-specific lesson;
  // shared introductions and navigation tables must never be deleted for prose.
  if (hasForeignCode(lines.slice(0, firstSection).join("\n"), profile)) return;
  const markdown = lines
    .filter((_, index) => !omitted.has(index))
    .join("\n")
    .trim();
  // A question list is useful study material even before answers are added.
  const hasQuestionList =
    headings(markdown).filter(
      (heading) => heading.level > 1 && heading.title.endsWith("?"),
    ).length >= 2;
  if (
    hasForeignCode(markdown, profile) ||
    (!hasQuestionList && markdown.replace(/^#+.*$/gm, "").trim().length < 40)
  )
    return;
  return { ...note, markdown };
}
export function knowledgeForProfile(
  base: Knowledge,
  profile: StackProfile,
): Knowledge {
  const notes = base.notes.flatMap((note) => {
    const supported = noteForProfile(note, profile);
    return supported ? [supported] : [];
  });
  const declared = base.profiles?.[profile] || base.route;
  const core = new Set(declared);
  const questions = base.questions
    .filter((question) => supportsQuestion(question, profile))
    .map((question) => ({
      ...questionForProfile(question, profile),
      curriculumTier: core.has(question.id)
        ? ("core" as const)
        : question.curriculumTier === "core"
          ? ("extended" as const)
          : question.curriculumTier,
    }));
  const available = new Set(questions.map((question) => question.id));
  return {
    ...base,
    notes,
    questions,
    route: declared.filter((id) => available.has(id)),
  };
}
