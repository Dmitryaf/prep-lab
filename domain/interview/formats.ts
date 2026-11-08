export type InterviewFormat = "mixed" | "coding" | "review" | "design";

export const interviewFormats = [
  {
    id: "mixed",
    title: "Смешанное интервью",
    description: "До 20 вопросов по стеку, задачам, проектированию и опыту.",
  },
  {
    id: "coding",
    title: "Написание кода",
    description:
      "Три короткие задачи и одна основная. Дополнительные усложнения — по желанию.",
  },
  {
    id: "review",
    title: "Ревью кода",
    description:
      "До трёх фрагментов: найдите ошибки, предложите исправления и проверки.",
  },
  {
    id: "design",
    title: "Проектирование",
    description:
      "Один сценарий: требования, компоненты, данные и архитектурные компромиссы.",
  },
] as const satisfies ReadonlyArray<{
  id: InterviewFormat;
  title: string;
  description: string;
}>;

export function formatInfo(format: InterviewFormat = "mixed") {
  return (
    interviewFormats.find((item) => item.id === format) || interviewFormats[0]
  );
}
