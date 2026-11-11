import type { Knowledge } from "#domain/knowledge/material.ts";
import type { ProjectCatalog } from "#domain/projects/catalog.ts";
import { questionKey } from "#domain/projects/review.ts";
import { hash } from "#domain/interview/deterministic.ts";
import type {
  IntensiveCatalog,
  IntensiveGoal,
  IntensiveLesson,
} from "./contracts.ts";

export class IntensiveInputError extends Error {}

export function buildIntensiveCatalog(
  knowledge: Knowledge,
  projects: ProjectCatalog,
): IntensiveCatalog {
  return {
    notes: knowledge.notes.map((note) => ({
      id: note.id,
      title: note.title,
      category: note.category,
      questionCount: knowledge.questions.filter(
        (question) => question.noteId === note.id && !question.parentId,
      ).length,
    })),
    projects: Object.values(projects.projects).map((project) => ({
      id: project.id,
      name: project.name,
      stack: project.stack,
      topicCount: projects.topics.filter(
        (topic) => topic.project === project.id,
      ).length,
    })),
  };
}

export function buildIntensiveLessons(
  goal: IntensiveGoal,
  knowledge: Knowledge,
  projects: ProjectCatalog,
): IntensiveLesson[] {
  const notes = new Map(knowledge.notes.map((note) => [note.id, note]));
  for (const id of goal.noteIds)
    if (!notes.has(id))
      throw new IntensiveInputError(
        "Выбранный материал больше недоступен. Обновите список материалов.",
      );
  for (const id of goal.projectIds)
    if (!Object.hasOwn(projects.projects, id))
      throw new IntensiveInputError(
        "Выбранный проект больше недоступен. Обновите список проектов.",
      );
  const lessons: IntensiveLesson[] = goal.noteIds.map((id) => {
    const note = notes.get(id)!;
    return {
      id: `note:${id}`,
      title: note.title,
      kind: "material",
      noteId: id,
      reading: {
        title: note.title,
        markdown: note.markdown,
        href: `/themes?note=${encodeURIComponent(id)}`,
      },
      questions: knowledge.questions.filter(
        (question) => question.noteId === id && !question.parentId,
      ),
    };
  });
  for (const projectId of goal.projectIds) {
    const project = projects.projects[projectId]!;
    for (const topic of projects.topics.filter(
      (topic) => topic.project === projectId,
    )) {
      const explanation = topic.pilot.explanation;
      lessons.push({
        id: `project:${projectId}:${topic.id}`,
        kind: "project",
        title: `${project.name}: ${topic.title}`,
        projectId,
        topicId: topic.id,
        reading: {
          title: topic.title,
          href: `/projects?projectTopic=${encodeURIComponent(topic.id)}`,
          markdown: [
            explanation.intro,
            ...explanation.steps.map(
              (step) => `## ${step.title}\n\n${step.text}`,
            ),
            explanation.details,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        questions: topic.pilot.questions.map((question) => ({
          id: questionKey(topic.id, question.id),
          title: question.question,
          prompt: question.question,
          answer: question.short,
          details: [...question.detailed, question.example]
            .filter(Boolean)
            .join("\n\n"),
          criteria: question.criteria || "",
          kind: "project",
          source: "projects",
          category: project.name,
          project: projectId,
          topicId: topic.id,
          availableAnswer: !!question.short.trim(),
          followups: [],
          learningLinks: topic.pilot.study.map((item) => ({
            kind: "theory",
            noteId: item.path.replace(/\.md$/, ""),
            heading: "",
            label: item.label,
          })),
        })),
      });
    }
  }
  if (!lessons.length)
    throw new IntensiveInputError(
      "В выбранных проектах пока нет тем для подготовки. Добавьте материалы или разбор проекта.",
    );
  return lessons;
}

export function orderIntensiveLessons(
  lessons: IntensiveLesson[],
  ids: string[],
) {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  return ids.map((id) => {
    const lesson = byId.get(id);
    if (!lesson)
      throw new IntensiveInputError(
        "Программа ссылается на занятие вне выбранных материалов.",
      );
    return lesson;
  });
}

export function intensiveAdditions(
  lessons: IntensiveLesson[],
  existing: IntensiveLesson[],
): IntensiveLesson[] {
  return lessons.flatMap((lesson) => {
    const previous = existing.filter((item) =>
      lesson.kind === "material"
        ? item.noteId === lesson.noteId
        : item.projectId === lesson.projectId &&
          item.topicId === lesson.topicId,
    );
    if (!previous.length) return [lesson];
    const latestQuestions = new Map(
      previous.flatMap((item) =>
        item.questions.map((question) => [question.id, question] as const),
      ),
    );
    const questions = lesson.questions.filter(
      (question) =>
        stableContent(question) !==
        stableContent(latestQuestions.get(question.id)),
    );
    const previousReading = previous.at(-1)!.reading;
    const readingChanged =
      stableContent(lesson.reading) !== stableContent(previousReading);
    if (!questions.length && !readingChanged) return [];
    const fingerprint = hash(
      stableContent({ reading: lesson.reading, questions }),
    ).toString(16);
    return [
      {
        ...lesson,
        id: `supplement:${lesson.id}:${previous.length}:${fingerprint}`,
        title: `${lesson.title} — дополнение`,
        questions,
      },
    ];
  });
}

function stableContent(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableContent).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableContent(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "";
}
