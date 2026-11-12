import type { Question } from "#domain/knowledge/question.ts";

type ApproachKind =
  "theory" | "diagnosis" | "coding" | "review" | "design" | "general";
type Approach = { kind: ApproachKind; summary: string };

const approaches: Record<ApproachKind, Omit<Approach, "kind">> = {
  theory: {
    summary: "Объясни механизм → покажи пример → обозначь ограничения.",
  },
  diagnosis: {
    summary:
      "Уточни симптом → предложи гипотезы → выбери проверку → исправь причину → проверь результат.",
  },
  coding: {
    summary:
      "Уточни вход и результат → разбери примеры → выбери решение → проверь крайние случаи и сложность.",
  },
  review: {
    summary:
      "Найди проблему → объясни последствия → предложи исправление → назови проверку.",
  },
  design: {
    summary:
      "Уточни требования → предложи простое решение → объясни компромиссы → проверь отказы и развитие.",
  },
  general: {
    summary:
      "Уточни условие → объясни ход мысли → обоснуй решение → проверь результат.",
  },
};

export function questionApproach(
  question: Pick<
    Question,
    "kind" | "title" | "category" | "noteId" | "roundFormat"
  >,
  followup = false,
): Approach | null {
  if (
    question.kind === "behavioral" ||
    /Поведенческие|HR/.test(question.category)
  )
    return null;
  const title = question.title;
  let kind: ApproachKind;
  // A theoretical followup may inherit its parent's coding/review metadata.
  if (
    followup &&
    /^(Почему|Чем |Что (такое|означает|произойдёт)|Как (работает|устроен))/.test(
      title,
    )
  )
    kind = "theory";
  else if (
    question.roundFormat === "review" ||
    /(?:^|\/)Ревью|Проведите? ревью|Найдите? ошибк|Проверка компонента/i.test(
      `${question.noteId || ""} ${title}`,
    )
  )
    kind = "review";
  else if (question.roundFormat === "design" || question.kind === "design")
    kind = "design";
  else if (question.roundFormat === "coding") kind = "coding";
  else if (
    (!followup && /\/Диагностика$/.test(question.noteId || "")) ||
    /(?:как (?:найти|искать|искать причину|диагностировать|разобраться)|как (?:будете )?искать|как ищете|как разбираетесь|куда смотрите|тормозит|не обновляется|не обновляются|падает|сбой|утечк)/i.test(
      title,
    )
  )
    kind = "diagnosis";
  else if (
    question.kind === "theory" ||
    /\/Инженерные вопросы$/.test(question.noteId || "")
  )
    kind = "theory";
  else if (/\/Инженерные решения$/.test(question.noteId || "")) kind = "design";
  else if (question.kind === "practice") kind = "coding";
  else kind = "general";
  return { kind, ...approaches[kind] };
}
