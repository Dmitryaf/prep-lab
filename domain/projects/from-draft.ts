import { projectDraftSchema, type ProjectDraft } from "./draft.ts";
import { projectCatalogSchema, emptyProjectCatalog } from "./catalog.ts";
import type { PromptInput } from "../prompts/contracts.ts";

export function validateProjectEvidence(
  input: ProjectDraft,
  context: PromptInput,
) {
  const draft = projectDraftSchema.parse(input);
  for (const fact of draft.roleFacts) {
    if (fact.basis === "user_statement" && !context.context.trim())
      throw new Error("Личная роль не описана пользователем.");
    if (
      fact.basis === "document" &&
      !context.materials.some((material) => material.id === fact.sourceId)
    )
      throw new Error("Факт ссылается на непереданный документ.");
  }
  for (const topic of draft.topics)
    for (const reference of topic.codeReferences) {
      const material = context.materials.find(
        (material) => material.id === reference.sourceId,
      );
      if (
        !material ||
        reference.startLine > reference.endLine ||
        reference.endLine > material.text.split(/\r?\n/).length
      )
        throw new Error("Ссылка на код выходит за переданный фрагмент.");
    }
  return draft;
}
export function projectFromDraft(
  input: ProjectDraft,
  context: PromptInput,
  makeId: () => string,
) {
  const draft = validateProjectEvidence(input, context),
    catalog = emptyProjectCatalog(),
    id = `review-${makeId()}`;
  const topicIds = draft.topics.map(() => `topic-${makeId()}`);
  const confirmed =
    draft.roleFacts
      .filter((fact) => fact.basis === "user_statement")
      .map((fact) => fact.text)
      .join("\n") || "Личная роль не подтверждена.";
  catalog.projects[id] = {
    id,
    name: draft.name,
    subtitle: "Принятый личный разбор",
    pitch: draft.summary,
    icon: "◈",
    repo: id,
    branch: "",
    color: "#2266aa",
    stack: [context.profile === "vue" ? "Vue" : "React"],
    routes: [
      {
        id: `route-${id}`,
        name: "Основной маршрут",
        caption: "Темы принятого разбора",
        nodes: topicIds,
      },
    ],
  };
  catalog.topics = draft.topics.map((topic, index) => {
    const topicId = topicIds[index];
    const code = topic.codeReferences.map((reference) => {
      const material = context.materials.find(
        (material) => material.id === reference.sourceId,
      )!;
      return {
        project: id,
        path: material.path,
        line: reference.startLine,
        symbol: `${reference.startLine}–${reference.endLine}`,
        title: material.path,
        explanation:
          reference.explanation +
          "\n\nПереданный фрагмент:\n\n```text\n" +
          material.text
            .split(/\r?\n/)
            .slice(reference.startLine - 1, reference.endLine)
            .join("\n") +
          "\n```",
      };
    });
    return {
      id: topicId,
      project: id,
      title: topic.title,
      group: "Личный разбор",
      priority: "P1",
      minutes: 8,
      summary: topic.explanation,
      mechanism: topic.mechanism,
      tradeoff: topic.tradeoff,
      question: topic.questions[0].question,
      answer: topic.questions[0].answer,
      sources: [],
      theory: [],
      related: topicIds.filter((other) => other !== topicId),
      story: {
        short: draft.summary,
        deep: topic.mechanism,
        confirmed,
        assumptions: draft.unknowns.join("\n"),
        reconstruction:
          "Подготовлено по выбранным материалам и принято пользователем.",
        boundaries:
          "Чтение фрагментов не подтверждает запуск, авторство и коммерческие результаты.",
      },
      pilot: {
        id: topicId,
        title: topic.title,
        explanation: {
          intro: topic.explanation,
          steps: topic.mechanism.map((text, number) => ({
            title: `Шаг ${number + 1}`,
            text,
          })),
        },
        study: [],
        questions: topic.questions.map((question) => ({
          id: `question-${makeId()}`,
          question: question.question,
          short: question.answer,
          criteria: question.criteria,
          detailed: [],
          example: "",
        })),
        code: {
          intro: code.length
            ? "Ссылки относятся к выбранным текстовым снимкам; доступ к исходной папке не заявляется."
            : "Исходники для этой темы не переданы.",
          steps: code,
          tests: [],
          limitations: draft.unknowns.join("\n"),
        },
      },
    };
  });
  catalog.experience[id] = {
    kind: "personal",
    notice:
      "Личный разбор по переданным данным. Код не подтверждает авторство; сведения о роли требуют рассказа пользователя.",
  };
  return { id, catalog: projectCatalogSchema.parse(catalog) };
}
