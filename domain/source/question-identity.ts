import type { PreparedQuestion } from "../knowledge/question.ts";

const key = (question: PreparedQuestion) => question.heading || question.title;
function signature(question: PreparedQuestion) {
  const prompt = question.prompt.startsWith(question.title)
    ? question.prompt.slice(question.title.length).trim()
    : question.prompt;
  return JSON.stringify(
    [question.kind, prompt, question.answer, question.criteria].map((value) =>
      value.replace(/\r\n?/g, "\n").trim(),
    ),
  );
}
export function assignQuestionIdentities(
  questions: PreparedQuestion[],
  previous: PreparedQuestion[],
  oldKeys: Record<string, string>,
  sourceId: string,
  makeId: () => string,
  matches: Record<string, string>,
) {
  const newKeys = new Set(questions.map(key));
  if (newKeys.size !== questions.length)
    throw new Error(
      "Повторяются заголовки вопросов. Уточните название или вложенность раздела.",
    );
  const previousByKey = new Map(
    previous.map((question) => [key(question), question]),
  );
  const history = new Map(Object.entries(oldKeys));
  const explicit = new Map<string, string>(),
    reserved = new Set<string>();
  for (const question of questions) {
    const heading = key(question),
      oldHeading = matches[heading];
    if (!oldHeading || !previousByKey.has(oldHeading)) continue;
    const id = history.get(oldHeading);
    if (!id || reserved.has(id))
      throw new Error("Прежний вопрос указан несколько раз.");
    explicit.set(heading, id);
    reserved.add(id);
  }
  for (const question of questions) {
    const heading = key(question),
      id = history.get(heading);
    if (
      !explicit.has(heading) &&
      previousByKey.has(heading) &&
      id &&
      !reserved.has(id)
    ) {
      explicit.set(heading, id);
      reserved.add(id);
    }
  }
  const used = new Set<string>(),
    rawToStable = new Map<string, string>();
  for (const question of questions) {
    const heading = key(question);
    let id = explicit.get(heading);
    const historical = history.get(heading);
    if (!id && historical && !reserved.has(historical) && !used.has(historical))
      id = historical;
    if (!id) {
      const candidates = previous.filter(
        (old) =>
          !newKeys.has(key(old)) &&
          history.has(key(old)) &&
          !reserved.has(history.get(key(old))!) &&
          !used.has(history.get(key(old))!) &&
          signature(old) === signature(question),
      );
      if (candidates.length === 1) id = history.get(key(candidates[0]));
    }
    id ||= `${sourceId}/question/${makeId()}`;
    if (used.has(id)) throw new Error("Повторяется идентификатор вопроса.");
    used.add(id);
    rawToStable.set(question.id, id);
    history.set(heading, id);
  }
  return {
    questionKeys: Object.fromEntries(history),
    questions: questions.map((question) => ({
      ...question,
      id: rawToStable.get(question.id)!,
      ...(question.parentId
        ? { parentId: rawToStable.get(question.parentId) }
        : {}),
    })),
  };
}
