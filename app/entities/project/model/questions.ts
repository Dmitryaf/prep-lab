import type { Topic, Project } from "../../../../domain/projects/types.ts";
import type { PreparedQuestion } from "../../../../domain/knowledge/question.ts";
import { questionCards } from "../../../../domain/projects/review.ts";
import type { ProjectCatalog } from "../../../../domain/projects/catalog.ts";

// Adapt the existing map; IDs, answers and code remain owned by its topics.
export function projectQuestions(
  topics: Topic[],
  projects: Record<string, Project> = {},
  experience: ProjectCatalog["experience"] = {},
): PreparedQuestion[] {
  return questionCards(topics).map((card) => {
    const topic = topics.find((t) => t.id === card.topicId)!;
    const q = card.pilot.questions.find((q) => q.id === card.questionId)!;
    const commercial = experience[card.project]?.kind === "commercial";
    const scope = commercial ? "Коммерческий опыт" : "Личный проект";
    const limits =
      experience[card.project]?.notice ||
      "Отделите собственную работу от решений библиотек и помощи других участников. Исходный код сам по себе не подтверждает личное авторство.";
    const facts =
      commercial && topic.story?.short
        ? `Подтверждённый рассказ о работе: ${topic.story.short}\n\n`
        : "";
    return {
      id: card.id,
      source: "projects",
      kind: "project",
      category: commercial ? "Коммерческий опыт" : "Собственные проекты",
      title: card.question,
      prompt: `${card.question}\n\n${scope}: ${projects[card.project]?.name || card.project} — ${topic.title}. ${limits}`,
      answer: facts + card.answer,
      details: [
        ...(q.detailed || []),
        q.example,
        commercial ? topic.story?.boundaries : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      criteria:
        "Объясняю задачу, свою часть работы, решение и альтернативу, сложность и способ проверки результата. Разделяю подтверждённые факты и учебные предположения.",
      topicId: card.topicId,
      project: card.project,
      projectGroup: topic.group,
      availableAnswer: true,
      followups: topic.interview || [],
      learningLinks: [
        ...(topic.pilot.study || []).map((n) => ({
          kind: "theory" as const,
          noteId: n.path.replace(/\.md$/, ""),
          heading: "",
          label: n.label,
        })),
        ...(commercial
          ? topic.sources
              .filter(([p]) => p.startsWith("Опыт и проекты/"))
              .map(([p, label]) => ({
                kind: "theory" as const,
                noteId: p.replace(/\.md$/, ""),
                heading: "",
                label,
              }))
          : []),
      ],
    };
  });
}
