// Pure selection and progress contracts shared by the UI and regression checks.
export const sessions = {
  custom: { label: 'Свободно', description: 'Выбери темы и объём самостоятельно.' },
  stories: { label: '10 минут · истории', description: 'По минуте на историю: задача, личный вклад, результат и граница ответственности.', budget: 10 },
  weak: { label: '20 минут · слабые темы', description: 'Сначала вопросы с отметкой «повторить», затем ещё не проверенные вопросы.', budget: 20 },
  project: { label: '40 минут · один проект', description: 'Последовательно восстанови сценарии, данные, решения и отказы выбранного проекта.', budget: 40 },
  exam: { label: 'Самопроверка', description: 'Ответь без подсказок. Разбор и код доступны после открытия ориентира.' },
};

export function selectReview(topics, progress, { project, scope = 'current', filter = 'priority', session = 'custom' }) {
  let list = topics.filter(t => scope === 'both' || t.project === project);
  const priority = { P0: 0, P1: 1, P2: 2 };
  if (session === 'stories') list = topics.filter(t => t.story);
  else if (session === 'weak') list = list.filter(t => progress[t.id]?.status !== 'done');
  else if (session === 'project') list = topics.filter(t => t.project === project);
  else {
    if (filter === 'priority') list = list.filter(t => t.priority === 'P0');
    if (filter === 'again') list = list.filter(t => progress[t.id]?.status === 'again');
    if (filter === 'new') list = list.filter(t => !progress[t.id]);
  }
  list.sort((a, b) => {
    if (session === 'weak') {
      const rank = t => progress[t.id]?.status === 'again' ? 0 : 1;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
    }
    return priority[a.priority] - priority[b.priority];
  });
  const budget = sessions[session]?.budget;
  if (!budget) return list;
  let used = 0;
  return list.filter(t => {
    const cost = session === 'stories' ? 1 : t.minutes;
    if (used + cost > budget) return false;
    used += cost;
    return true;
  });
}

export function validatedProgress(value, ids) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректный прогресс');
  const result = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!ids.has(id)) continue; // Older/newer maps may contain other topics.
    if (!entry || !['done', 'again'].includes(entry.status) || (entry.updatedAt !== undefined && typeof entry.updatedAt !== 'string')) {
      throw new Error('Некорректная отметка темы');
    }
    result[id] = { status: entry.status, updatedAt: entry.updatedAt || '' };
  }
  return result;
}

export function mergeProgressFile(text, current, ids) {
  const file = JSON.parse(text);
  if (file?.version !== 1) throw new Error('Неизвестная версия');
  return { ...current, ...validatedProgress(file.progress, ids) };
}

// Question identity survives reordering; topic and question IDs are separate namespaces.
export function questionKey(topicId, questionId) {
  return `${encodeURIComponent(topicId)}/${encodeURIComponent(questionId)}`;
}

export function questionCards(topics, mode = 'full') {
  return topics.flatMap(topic => {
    const questions = topic.pilot.questions;
    return (mode === 'quick' ? questions.slice(0, 1) : questions).map(question => ({
      ...topic, id: questionKey(topic.id, question.id), topicId: topic.id, questionId: question.id,
      question: question.question, answer: question.short,
      minutes: topic.minutes / questions.length,
    }));
  });
}

export function selectQuestionReview(topics, questionProgress, options) {
  return selectReview(questionCards(topics, options.mode), questionProgress, options);
}

export function progressSnapshot(progress, questionProgress) {
  return { version: 2, progress, questionProgress };
}

export function mergeProgressSnapshot(text, current, topicIds, questionIds) {
  const file = JSON.parse(text);
  if (file?.version !== 1 && file?.version !== 2) throw new Error('Неизвестная версия');
  const progress = validatedProgress(file.progress, topicIds);
  const questionProgress = file.version === 2 ? validatedProgress(file.questionProgress, questionIds) : {};
  // Validate both sections before producing a new snapshot. A v1 mark never answers a question.
  return progressSnapshot({ ...current.progress, ...progress }, { ...current.questionProgress, ...questionProgress });
}
