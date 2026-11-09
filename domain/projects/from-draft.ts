import { projectDraftSchema, type ProjectDraft } from "./draft.ts";
import {
  projectCatalogSchema,
  emptyProjectCatalog,
  type ProjectCatalog,
} from "./catalog.ts";
import type { PromptInput } from "#domain/prompts/contracts.ts";
import { codePreview } from "./code.ts";

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
  if (
    draft.map?.nodes.some((node) =>
      [
        ...node.topicIndexes,
        ...(node.steps || []).flatMap((step) => step.topicIndexes),
      ].some((index) => index >= draft.topics.length),
    )
  )
    throw new Error("Карта ссылается на неизвестную тему.");
  return draft;
}
export function projectFromDraft(
  input: ProjectDraft,
  context: PromptInput,
  makeId: () => string,
  previous?: { id: string; catalog: ProjectCatalog },
) {
  const draft = validateProjectEvidence(input, context),
    catalog = emptyProjectCatalog(),
    id = previous?.id || `review-${makeId()}`;
  const priorTopics =
    previous?.catalog.topics.filter((topic) => topic.project === id) || [];
  const priorFor = (topic: ProjectDraft["topics"][number]) =>
    priorTopics.find((old) =>
      topic.previousTopicId
        ? old.id === topic.previousTopicId
        : old.title === topic.title,
    );
  for (const topic of draft.topics)
    if (topic.previousTopicId && !priorFor(topic))
      throw new Error("Неизвестная прежняя тема.");
  for (const topic of draft.topics)
    for (const question of topic.questions) {
      if (
        question.previousQuestionId &&
        !priorFor(topic)?.pilot.questions.some(
          (old) => old.id === question.previousQuestionId,
        )
      )
        throw new Error("Неизвестный прежний вопрос.");
    }
  const topicIds = draft.topics.map(
    (topic) => priorFor(topic)?.id || `topic-${makeId()}`,
  );
  const confirmed = draft.roleFacts.map((fact) => fact.text).join("\n");
  catalog.projects[id] = {
    id,
    name: draft.name,
    subtitle: "Устройство и сценарии проекта",
    pitch: draft.summary,
    icon: "◈",
    repo: id,
    branch: "",
    color: "#2266aa",
    stack: draft.stack ||
      previous?.catalog.projects[id]?.stack || [
        context.profile === "vue" ? "Vue" : "React",
      ],
    ...(draft.map
      ? {
          map: {
            nodes: draft.map.nodes.map(({ topicIndexes, steps, ...node }) => ({
              ...node,
              topicIds: topicIndexes.map((index) => topicIds[index]),
              ...(steps
                ? {
                    steps: steps.map(({ topicIndexes: indexes, ...step }) => ({
                      ...step,
                      topicIds: indexes.map((index) => topicIds[index]),
                    })),
                  }
                : {}),
            })),
            edges: draft.map.edges,
          },
        }
      : {}),
    routes: [
      {
        id: `route-${id}`,
        name: "Знакомство с проектом",
        caption: "От назначения приложения к основным сценариям и коду",
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
        explanation: reference.explanation,
        preview: codePreview(
          material.text,
          reference.startLine,
          reference.endLine,
        ),
      };
    });
    return {
      id: topicId,
      project: id,
      title: topic.title,
      group: "Устройство проекта",
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
        short: confirmed,
        deep: [],
        confirmed,
        assumptions: draft.unknowns.join("\n"),
        reconstruction: "",
        boundaries: "",
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
          id:
            priorFor(topic)?.pilot.questions.find((old) =>
              question.previousQuestionId
                ? old.id === question.previousQuestionId
                : old.question === question.question,
            )?.id || `question-${makeId()}`,
          question: question.question,
          short: question.answer,
          criteria: question.criteria,
          detailed: [],
          example: "",
        })),
        code: {
          intro: code.length ? "Код основных шагов сценария." : "",
          steps: code,
          tests: [],
        },
      },
    };
  });
  for (const topic of catalog.topics) {
    const old = priorTopics.find((item) => item.id === topic.id);
    if (old)
      topic.pilot.questions.push(
        ...old.pilot.questions.filter(
          (q) => !topic.pilot.questions.some((next) => next.id === q.id),
        ),
      );
  }
  catalog.topics.push(
    ...priorTopics.filter((topic) => !topicIds.includes(topic.id)),
  );
  const questionIds = catalog.topics.flatMap((topic) =>
    topic.pilot.questions.map((question) => question.id),
  );
  if (new Set(questionIds).size !== questionIds.length)
    throw new Error("Повторяются ID вопросов проекта.");
  catalog.projects[id].routes[0].nodes = catalog.topics.map(
    (topic) => topic.id,
  );
  catalog.experience[id] = {
    kind: "personal",
  };
  return { id, catalog: projectCatalogSchema.parse(catalog) };
}
