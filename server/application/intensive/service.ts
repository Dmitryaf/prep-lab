import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Knowledge } from "#domain/knowledge/material.ts";
import type { ProjectCatalog } from "#domain/projects/catalog.ts";
import {
  intensiveGoalSchema,
  intensiveLessonIdsSchema,
  intensiveProgressInputSchema,
  type IntensiveGoal,
  type IntensiveProgram,
} from "#domain/intensive/contracts.ts";
import {
  buildIntensiveCatalog,
  buildIntensiveLessons,
  intensiveAdditions,
  orderIntensiveLessons,
  IntensiveInputError,
} from "#domain/intensive/program.ts";
import type { IntensiveRepository } from "#server/infrastructure/intensive/repository.ts";
import { RevisionConflict } from "#server/infrastructure/storage/preparation.ts";
import { intensiveStorySchema } from "#domain/intensive/contracts.ts";
import { intensiveContext } from "#domain/intensive/context.ts";

export class IntensiveService {
  private readonly repository: IntensiveRepository;
  private readonly knowledge: () => Promise<Knowledge>;
  private readonly projects: () => ProjectCatalog;
  constructor(options: {
    repository: IntensiveRepository;
    knowledge: () => Promise<Knowledge>;
    projects: () => ProjectCatalog;
  }) {
    this.repository = options.repository;
    this.knowledge = options.knowledge;
    this.projects = options.projects;
  }
  read() {
    return this.repository.read();
  }
  async catalog() {
    return buildIntensiveCatalog(await this.knowledge(), this.projects());
  }
  async context(lessonId: string) {
    const lesson = this.read().state.plan?.lessons.find(
      (item) => item.id === lessonId,
    );
    if (!lesson)
      throw new IntensiveInputError("Занятие не найдено в принятой программе.");
    return intensiveContext(lesson, await this.knowledge(), this.projects());
  }
  updatePlan(input: IntensiveGoal, ids: string[], expectedRevision: number) {
    const goal = intensiveGoalSchema.parse(input);
    const lessonIds = intensiveLessonIdsSchema.parse(ids);
    return this.repository.update(expectedRevision, (state) => {
      if (!state.plan)
        throw new IntensiveInputError("Сначала примите программу.");
      const selected = orderIntensiveLessons(state.plan.lessons, lessonIds);
      const hidden = state.plan.lessons.filter(
        (lesson) => !lessonIds.includes(lesson.id),
      );
      return {
        ...state,
        plan: {
          ...state.plan,
          goal: {
            ...goal,
            noteIds: state.plan.goal.noteIds,
            projectIds: state.plan.goal.projectIds,
          },
          lessons: [...selected, ...hidden],
          hiddenLessonIds: hidden.map((lesson) => lesson.id),
        },
      };
    });
  }
  saveStory(projectId: string, input: unknown, expectedRevision: number) {
    const story = intensiveStorySchema.parse(input);
    return this.repository.update(expectedRevision, (state) => {
      if (!state.plan?.lessons.some((lesson) => lesson.projectId === projectId))
        throw new IntensiveInputError("Проект не найден в программе.");
      return { ...state, stories: { ...state.stories, [projectId]: story } };
    });
  }
  async preview(input: IntensiveGoal): Promise<IntensiveProgram> {
    const goal = intensiveGoalSchema.parse(input);
    const existing = this.read().state.plan;
    if (
      existing &&
      (["title", "direction", "vacancy", "interviewDate"] as const).some(
        (key) => (goal[key] || "") !== (existing.goal[key] || ""),
      )
    ) {
      throw new IntensiveInputError(
        "Дополнение относится к текущей цели подготовки. Сохраните её название, направление и параметры.",
      );
    }
    const lessons = intensiveAdditions(
      buildIntensiveLessons(goal, await this.knowledge(), this.projects()),
      existing?.lessons || [],
    );
    if (!lessons.length)
      throw new IntensiveInputError(
        "Эти материалы уже включены в программу. Выберите новые темы или добавьте вопросы в базу.",
      );
    return {
      id: randomUUID(),
      goal,
      lessons,
      createdAt: new Date().toISOString(),
    };
  }
  async draft(goal: IntensiveGoal, expectedRevision: number) {
    const draft = await this.preview(goal);
    return this.repository.update(expectedRevision, (state) => ({
      ...state,
      draft,
    }));
  }
  async propose(goal: IntensiveGoal, ids: string[], expectedRevision: number) {
    const lessonIds = intensiveLessonIdsSchema.parse(ids);
    const draft = await this.preview(goal);
    draft.lessons = orderIntensiveLessons(draft.lessons, lessonIds);
    return this.repository.update(expectedRevision, (state) => ({
      ...state,
      draft,
    }));
  }
  async accept(ids: string[], expectedRevision: number) {
    const lessonIds = intensiveLessonIdsSchema.parse(ids);
    const snapshot = this.read();
    if (snapshot.revision !== expectedRevision)
      throw new RevisionConflict(
        "Интенсив изменился. Обновите страницу перед сохранением.",
      );
    const draft = snapshot.state.draft;
    if (!draft) throw new IntensiveInputError("Сначала составьте программу.");
    const selected = orderIntensiveLessons(draft.lessons, lessonIds);
    const current = await this.preview(draft.goal);
    const currentLessons = new Map(
      current.lessons.map((lesson) => [lesson.id, lesson]),
    );
    if (
      selected.some(
        (lesson) => !isDeepStrictEqual(lesson, currentLessons.get(lesson.id)),
      )
    )
      throw new IntensiveInputError(
        "Материалы изменились после составления программы. Подготовьте обновлённый вариант.",
      );
    return this.repository.update(expectedRevision, (state) => {
      const previous = state.plan;
      const goal = previous
        ? {
            ...previous.goal,
            noteIds: [
              ...new Set([...previous.goal.noteIds, ...draft.goal.noteIds]),
            ],
            projectIds: [
              ...new Set([
                ...previous.goal.projectIds,
                ...draft.goal.projectIds,
              ]),
            ],
          }
        : draft.goal;
      return {
        ...state,
        draft: null,
        plan: {
          ...draft,
          goal,
          id: previous?.id || draft.id,
          ...(previous?.hiddenLessonIds
            ? { hiddenLessonIds: previous.hiddenLessonIds }
            : {}),
          lessons: [...(previous?.lessons || []), ...selected],
        },
      };
    });
  }
  updateProgress(lessonId: string, input: unknown, expectedRevision: number) {
    const progress = intensiveProgressInputSchema.parse(input);
    return this.repository.update(expectedRevision, (state) => {
      const lesson = state.plan?.lessons.find((item) => item.id === lessonId);
      if (!lesson)
        throw new IntensiveInputError(
          "Занятие не найдено в принятой программе.",
        );
      const questions = new Set(
        lesson.questions.map((question) => question.id),
      );
      if (Object.keys(progress.drafts).some((id) => !questions.has(id)))
        throw new IntensiveInputError("Ответ относится к другому занятию.");
      if (
        [
          ...Object.keys(progress.assessments || {}),
          ...Object.keys(progress.checks || {}),
        ].some((id) => !questions.has(id))
      )
        throw new IntensiveInputError("Оценка относится к другому занятию.");
      if (
        progress.questionId !== undefined &&
        !questions.has(progress.questionId)
      )
        throw new IntensiveInputError(
          "Выбранный вопрос относится к другому занятию.",
        );
      return {
        ...state,
        progress: {
          ...state.progress,
          [lessonId]: {
            ...state.progress[lessonId],
            ...progress,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  }
  addRepeat(lessonId: string, text: string, expectedRevision: number) {
    return this.repository.update(expectedRevision, (state) => {
      if (!state.plan?.lessons.some((lesson) => lesson.id === lessonId))
        throw new IntensiveInputError(
          "Занятие не найдено в принятой программе.",
        );
      return {
        ...state,
        tomorrow: [
          ...state.tomorrow,
          { id: randomUUID(), lessonId, text: text.trim(), done: false },
        ],
      };
    });
  }
  updateRepeat(id: string, done: boolean, expectedRevision: number) {
    return this.repository.update(expectedRevision, (state) => {
      if (!state.tomorrow.some((item) => item.id === id))
        throw new IntensiveInputError("Повторение не найдено.");
      return {
        ...state,
        tomorrow: state.tomorrow.map((item) =>
          item.id === id ? { ...item, done } : item,
        ),
      };
    });
  }
}
