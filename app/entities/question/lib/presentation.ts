import type { Question } from "../../../../domain/knowledge/question.ts";
import { useProjectCatalog } from "../../project/model/catalog.ts";
const labels: Record<string, string> = {
  theory: "Вопрос",
  practice: "Практическая задача",
  design: "Проектирование",
  behavioral: "Опыт и коммуникация",
};
export function kindLabel(q: Question) {
  return q.kind === "project"
    ? q.project === "lanit" ||
      q.topicId?.startsWith("ln-") ||
      q.id.startsWith("ln-") ||
      q.category === "Коммерческий опыт"
      ? "Коммерческий опыт"
      : "Личный проект"
    : labels[q.kind] || "Вопрос";
}
export function categoryLabel(q: Question) {
  const { projects, topics } = useProjectCatalog();
  return q.kind === "project"
    ? projects[
        q.project || topics.find((t) => t.id === q.topicId)?.project || ""
      ]?.name || kindLabel(q)
    : q.category || "Фронтенд";
}
