import type { Topic, Project } from "#domain/projects/types.ts";
import type { PreparedQuestion } from "#domain/knowledge/question.ts";
import { questionCards } from "#domain/projects/review.ts";
import type { ProjectCatalog } from "#domain/projects/catalog.ts";
import { cleanEditorialNotes } from "#domain/knowledge/editorial-notes.ts";

// Adapt the existing map; IDs, answers and code remain owned by its topics.
export function projectQuestions(
  topics: Topic[],
  _projects: Record<string, Project> = {},
  experience: ProjectCatalog["experience"] = {},
): PreparedQuestion[] {
  return questionCards(topics).map((card) => {
    const topic = topics.find((t) => t.id === card.topicId)!;
    const q = card.pilot.questions.find((q) => q.id === card.questionId)!;
    const commercial = experience[card.project]?.kind === "commercial";
    const notice = cleanEditorialNotes(
      experience[card.project]?.notice || "",
    ).trim();
    return {
      id: card.id,
      source: "projects",
      kind: "project",
      category: commercial ? "Коммерческий опыт" : "Собственные проекты",
      title: card.question,
      prompt: [card.question, notice].filter(Boolean).join("\n\n"),
      answer: card.answer,
      details: [
        ...(q.detailed || []),
        q.example,
        commercial ? topic.story?.boundaries : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      criteria:
        q.criteria ||
        "Объясняю задачу, свою часть работы, решение и альтернативу, сложность и способ проверки результата.",
      topicId: card.topicId,
      project: card.project,
      projectGroup: topic.group,
      availableAnswer: true,
      followups: topic.interview || [],
      followupAnswers: (topic.interview || []).flatMap((title) => {
        const followup = topic.pilot.questions.find(
          (item) => item.id !== q.id && item.question === title,
        );
        return followup?.short.trim()
          ? [
              {
                title,
                answer: [followup.short, ...followup.detailed, followup.example]
                  .filter(Boolean)
                  .join("\n\n"),
                criteria: followup.criteria,
              },
            ]
          : [];
      }),
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
