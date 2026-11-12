import test from "node:test";
import assert from "node:assert/strict";
import { IntensiveService } from "#server/application/intensive/service.ts";
import { IntensiveRepository } from "#server/infrastructure/intensive/repository.ts";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import { RevisionConflict } from "#server/infrastructure/storage/preparation.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";
import {
  activeLessons,
  lessonGaps,
  lessonLocation,
} from "#domain/intensive/navigation.ts";
import { intensiveStateSchema } from "#domain/intensive/contracts.ts";

async function fixture() {
  const db = openDatabase(":memory:");
  const projects = projectFixture();
  const service = new IntensiveService({
    repository: new IntensiveRepository(db),
    projects: () => projects,
    knowledge: async () => ({
      notes: [
        {
          id: "validation",
          path: "Фронтенд/TypeScript/07. API, unknown и проверка данных.md",
          category: "TypeScript",
          title: "Проверка данных",
          markdown: "Проверяйте ответ API.",
        },
      ],
      questions: [],
      warnings: [],
      route: [],
    }),
  });
  const goal = {
    title: "Разобраться в проекте",
    noteIds: [],
    projectIds: ["first"],
  };
  const draft = await service.draft(goal, 0);
  const snapshot = await service.accept(
    draft.state.draft!.lessons.map((lesson) => lesson.id),
    draft.revision,
  );
  return { db, service, goal, snapshot };
}

test("question gaps, checks and stories survive a plan edit, hiding and restoring lessons", async () => {
  const { db, service, goal, snapshot } = await fixture();
  try {
    const lesson = snapshot.state.plan!.lessons[0]!;
    const question = lesson.questions[0]!;
    const marked = service.updateProgress(
      lesson.id,
      {
        status: "in-progress",
        step: "check",
        questionId: question.id,
        drafts: { [question.id]: "Первый ответ" },
        checks: { [question.id]: "Новый ответ" },
        assessments: {
          [question.id]: { level: "gap", note: "Не понимаю проверку входа" },
        },
        notes: "",
      },
      snapshot.revision,
    );
    assert.equal(lessonGaps(marked.state.progress[lesson.id]), 1);
    const story = {
      purpose: "Сохранение записей",
      scenario: "Открыть форму и сохранить",
      structure: "Форма → API",
      contribution: "Валидация",
      decisions: "Проверять на границе",
      constraints: "Сбой API",
      result: "Ввод сохраняется",
    };
    const written = service.saveStory("first", story, marked.revision);
    const ids = written.state.plan!.lessons.map((item) => item.id);
    const edited = service.updatePlan(
      { ...goal, title: "Новая вакансия", vacancy: "Работа с API" },
      ids.slice(1).reverse(),
      written.revision,
    );
    assert.equal(activeLessons(edited.state.plan).length, 2);
    assert.deepEqual(edited.state.progress, marked.state.progress);
    assert.deepEqual(edited.state.stories?.first, story);
    assert.equal(edited.state.plan!.goal.title, "Новая вакансия");
    const restored = service.updatePlan(
      edited.state.plan!.goal,
      ids,
      edited.revision,
    );
    assert.equal(activeLessons(restored.state.plan).length, 3);
    assert.deepEqual(restored.state.progress, marked.state.progress);
    assert.throws(
      () => service.saveStory("first", story, written.revision),
      RevisionConflict,
    );
    assert.throws(
      () => service.saveStory("second", story, restored.revision),
      /не найден/,
    );
    assert.throws(
      () =>
        service.updateProgress(
          lesson.id,
          {
            status: "done",
            drafts: {},
            notes: "",
            assessments: { foreign: { level: "gap", note: "" } },
          },
          restored.revision,
        ),
      /другому/,
    );
    assert.throws(
      () => service.updatePlan(goal, ["foreign"], restored.revision),
      /вне выбранных/,
    );
    const solved = service.updateProgress(
      lesson.id,
      {
        ...restored.state.progress[lesson.id],
        assessments: {
          [question.id]: {
            level: "independent",
            note: "Не понимаю проверку входа",
          },
        },
      },
      restored.revision,
    );
    assert.equal(lessonGaps(solved.state.progress[lesson.id]), 0);
    assert.deepEqual(solved.state.tomorrow, []);
    assert.deepEqual(intensiveStateSchema.parse(solved.state), solved.state);
  } finally {
    db.close();
  }
});

test("lesson context resolves accepted project, code and theory without rewriting snapshots", async () => {
  const { db, service, snapshot } = await fixture();
  try {
    const lesson = snapshot.state.plan!.lessons[0]!;
    const context = await service.context(lesson.id);
    assert.equal(context.projectName, "Первый пример");
    assert.equal(context.code[0]!.symbol, "validateInput");
    assert.equal(context.materials[0]!.id, "validation");
    assert(context.map.nodes.length > 0);
    assert.deepEqual(service.read(), snapshot);
    const location = lessonLocation(lesson, await service.catalog());
    assert.equal(location.title, "Контракт операции");
    assert.equal(location.block, "Сценарии");
    await assert.rejects(service.context("../../secret"), /не найден/);
    assert.equal(
      intensiveStateSchema.parse({
        version: 1,
        plan: null,
        draft: null,
        progress: {},
        tomorrow: [],
      }).stories,
      undefined,
    );
  } finally {
    db.close();
  }
});
