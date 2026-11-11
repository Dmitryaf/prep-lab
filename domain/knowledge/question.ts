export const technicalQuestionInstructions =
  "Технический вопрос формулируй естественно и с достаточным контекстом: назови наблюдаемую ситуацию, действие или механизм. Ответ должен прямо отвечать на вопрос и объяснять механизм на конкретном примере. Для диагностики свяжи наблюдаемый симптом с несколькими гипотезами, различающей их проверкой, минимальным исправлением и повторной проверкой результата; названия инструментов без объяснения наблюдений недостаточны. Для задачи покажи решение, границы и подходящие проверки; для проектирования — требования и существенные компромиссы. Не подменяй теоретическое объяснение шаблоном диагностики. Не выдавай предполагаемую причину за доказанную. В **Изучить:** добавляй ссылки не только на обзор темы, но и на основы, необходимые для понимания механизма: например, Proxy и Reflect для реактивности Vue. Каждый пункт списка **Уточнения** должен иметь собственный ответ в закрытом Markdown-блоке > [!followup]- точный текст уточнения; строки ответа начинаются с >. Не заменяй ответ уточнения общим разбором темы. Необязательные подсказки к задачам оформляй отдельным закрытым блоком > [!note]- Подсказка; обязательные условия оставляй открытыми. Не добавляй в технический банк общие вопросы о коммуникации, найме, наставничестве, оценке сроков и управлении командой. Вопросы об API, диагностике, зависимостях и проверке кода оставляй техническими. HR-материалы сохраняй без редакторских изменений. При согласованном переименовании Markdown-вопроса сохраняй его прежний ключ через **ID вопроса:** прежний заголовок; служебный ключ не является частью вопроса или ответа.";

export interface StudyLink {
  kind: "theory" | "practice";
  noteId: string;
  heading: string;
  label: string;
  profiles?: ("vue" | "react")[];
}
export interface Question {
  interviewEligible?: boolean;
  roundFormat?: "coding" | "review" | "design";
  codingRole?: "short" | "main" | "advanced";
  profiles?: ("vue" | "react")[];
  id: string;
  title: string;
  prompt: string;
  answer: string;
  kind: string;
  source: string;
  category: string;
  availableAnswer?: boolean;
  shortAnswer?: string;
  criteria?: string;
  details?: string;
  noteId?: string;
  heading?: string;
  topicId?: string;
  project?: string;
  projectGroup?: string;
  parentId?: string;
  curriculumTier?: "core" | "extended" | "vacancy";
  followups?: string[];
  followupAnswers?: {
    title: string;
    answer: string;
    prompt?: string;
    criteria?: string;
  }[];
  learningLinks?: StudyLink[];
}
export type PreparedQuestion = Question & {
  followups: string[];
  learningLinks: StudyLink[];
  criteria: string;
};

export function isTestingTask(question: Pick<Question, "kind" | "category">) {
  return question.kind === "practice" && question.category === "Тестирование";
}
