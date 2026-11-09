import { z } from "zod";
export const projectQuestionInstructions =
  "Каждый проектный вопрос должен быть понятен отдельно от темы: назови конкретный сценарий, данные или механизм проекта и спроси, как он работает или почему выбран. Вместо «Как выбрать границу модуля?» спроси, почему синхронизация вынесена из компонентов и store. Используй естественные формулировки собеседования. Ответ прямо раскрывает названный механизм, а критерии относятся к этому вопросу. Не добавляй общие вопросы о коммуникации, взаимодействии с аналитиками/backend/QA, найме, наставничестве, оценке сроков и управлении командой. Технические вопросы об API, ошибках, зависимостях и проверке кода раскрывай через конкретный сценарий. Не добавляй служебные оговорки и подсказки под вопросом.";
export const projectMapInstructions =
  "Карта предназначена для изучения проекта. Сценарии — конкретные действия пользователя, модули — крупные ответственности, технологии — назначение и реальные места применения. Разделяй contains (состав), uses (зависимость) и flow (взаимодействие), не связывай все узлы только с названием проекта. Для основных исследованных сценариев добавляй steps: 3–8 последовательных шагов с id, label, description и topicIndexes. Объясняй, кто принимает действие, как меняются состояние и данные, что возвращается пользователю. Не превращай компромиссы и список технологий в шаги сценария; не придумывай последовательность для непроверенного кода. Шаги и технологии должны ссылаться на подходящие темы. В description пиши краткое назначение, подробности остаются в темах и codeReferences.";
export const projectDraftSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(160),
  summary: z.string().min(1).max(3000),
  stack: z.array(z.string().min(1).max(100)).max(40).optional(),
  map: z
    .strictObject({
      nodes: z
        .array(
          z.strictObject({
            id: z.string().min(1).max(120),
            label: z.string().min(1).max(200),
            kind: z.enum(["scenario", "module", "technology", "system"]),
            description: z.string().max(4000),
            topicIndexes: z.array(z.number().int().nonnegative()).max(80),
            steps: z
              .array(
                z.strictObject({
                  id: z.string().min(1).max(120),
                  label: z.string().min(1).max(200),
                  description: z.string().max(4000),
                  topicIndexes: z.array(z.number().int().nonnegative()).max(80),
                }),
              )
              .min(2)
              .max(12)
              .optional(),
          }),
        )
        .min(1)
        .max(100),
      edges: z
        .array(
          z.strictObject({
            from: z.string(),
            to: z.string(),
            label: z.string().min(1).max(200),
            kind: z.enum(["flow", "uses", "contains"]),
          }),
        )
        .max(250),
    })
    .optional(),
  roleFacts: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(2000),
        basis: z.enum(["user_statement", "document"]),
        sourceId: z.string().nullable(),
      }),
    )
    .max(40),
  unknowns: z.array(z.string().min(1).max(1000)).max(40),
  topics: z
    .array(
      z.strictObject({
        previousTopicId: z.string().optional(),
        title: z.string().min(1).max(200),
        explanation: z.string().min(1).max(6000),
        mechanism: z.array(z.string().max(1500)).min(1).max(12),
        tradeoff: z.string().min(1).max(3000),
        questions: z
          .array(
            z.strictObject({
              question: z.string().min(1).max(1200),
              previousQuestionId: z.string().optional(),
              answer: z.string().min(1).max(6000),
              criteria: z.string().min(1).max(3000),
            }),
          )
          .min(1)
          .max(10),
        codeReferences: z
          .array(
            z.strictObject({
              sourceId: z.string(),
              startLine: z.number().int().positive(),
              endLine: z.number().int().positive(),
              explanation: z.string().min(1).max(2000),
            }),
          )
          .max(20),
      }),
    )
    .min(1)
    .max(80),
});
export type ProjectDraft = z.infer<typeof projectDraftSchema>;
