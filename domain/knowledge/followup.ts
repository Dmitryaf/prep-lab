import type { Question } from "./question.ts";

export function followupQuestion(
  question: Question,
  index: number,
  current?: Question,
): Question | null {
  const title = question.followups?.[index - 1];
  if (!title) return null;
  const stored = question.followupAnswers?.find((item) => item.title === title);
  const answer = stored?.answer.trim()
    ? stored
    : current?.id === question.id
      ? current.followupAnswers?.find((item) => item.title === title)
      : undefined;
  return {
    ...question,
    title,
    prompt: stored?.prompt || title,
    answer: answer?.answer || "",
    shortAnswer: "",
    details: "",
    criteria: answer?.criteria || "",
    availableAnswer: !!answer?.answer.trim(),
    followups: [],
    followupAnswers: [],
  };
}
