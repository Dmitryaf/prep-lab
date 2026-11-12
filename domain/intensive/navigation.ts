import type {
  IntensiveCatalog,
  IntensiveLesson,
  IntensiveProgress,
  IntensiveProgram,
} from "./contracts.ts";

export function activeLessons(plan: IntensiveProgram | null | undefined) {
  return (
    plan?.lessons.filter(
      (lesson) => !plan.hiddenLessonIds?.includes(lesson.id),
    ) || []
  );
}
export function lessonGaps(progress?: IntensiveProgress) {
  return Object.values(progress?.assessments || {}).filter(
    (item) => item.level !== "independent",
  ).length;
}
export function lessonLocation(
  lesson: IntensiveLesson,
  catalog: IntensiveCatalog,
) {
  const topic = catalog.topics?.find((item) => item.id === lesson.topicId);
  const project = catalog.projects.find((item) => item.id === lesson.projectId);
  const note = catalog.notes.find((item) => item.id === lesson.noteId);
  return {
    owner:
      project?.name ||
      (lesson.projectId
        ? lesson.questions[0]?.category || lesson.projectId
        : note?.category || lesson.questions[0]?.category || "Материалы"),
    block: topic?.group || (lesson.projectId ? "Темы проекта" : "Темы"),
    title: topic?.title || lesson.reading.title,
  };
}
