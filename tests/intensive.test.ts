import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import type { Knowledge } from "#domain/knowledge/material.ts";
import type { PreparedQuestion } from "#domain/knowledge/question.ts";
import type {
  IntensiveGoal,
  IntensiveSnapshot,
} from "#domain/intensive/contracts.ts";
import { buildIntensiveLessons } from "#domain/intensive/program.ts";
import { emptyProjectCatalog } from "#domain/projects/catalog.ts";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import {
  PreparationRepository,
  RevisionConflict,
} from "#server/infrastructure/storage/preparation.ts";
import { IntensiveRepository } from "#server/infrastructure/intensive/repository.ts";
import { IntensiveService } from "#server/application/intensive/service.ts";
import { handleIntensive } from "#server/infrastructure/intensive/http.ts";
import { projectFixture } from "#tests/fixtures/projects.ts";

const question = (id: string, noteId = "sql"): PreparedQuestion => ({
  id,
  noteId,
  title: `Запрос ${id}`,
  prompt: "Найдите повторные операции.",
  answer: "Сгруппируйте строки по ключу.",
  kind: "practice",
  category: "Аналитика",
  source: "personal",
  criteria: "Одна строка на ключ",
  followups: [],
  learningLinks: [],
});
const knowledge = (): Knowledge => ({
  notes: [
    {
      id: "sql",
      path: "Аналитика/SQL.md",
      title: "SQL для аналитика",
      category: "Аналитика",
      markdown: "# SQL\n\nГруппировка и агрегаты.",
    },
    {
      id: "backend",
      path: "Backend/Транзакции.md",
      title: "Транзакции",
      category: "Backend",
      markdown: "# Транзакции\n\nГраницы операции.",
    },
  ],
  questions: Array.from({ length: 37 }, (_, index) => question(`q${index}`)),
  route: [],
  warnings: [],
});
const goal: IntensiveGoal = {
  title: "Подготовиться к собеседованию аналитика",
  direction: "Аналитика",
  noteIds: ["sql", "backend"],
  projectIds: [],
};

test("intensive covers all selected material regardless of stack or question limits, including reading-only lessons", () => {
  const lessons = buildIntensiveLessons(
    goal,
    knowledge(),
    emptyProjectCatalog(),
  );
  assert.equal(lessons.length, 2);
  assert.equal(lessons[0]!.questions.length, 37);
  assert.equal(lessons[1]!.questions.length, 0);
  assert.match(lessons[1]!.reading.markdown, /Границы операции/);
  assert.equal(lessons[0]!.reading.href, "/themes?note=sql");
  assert.throws(
    () =>
      buildIntensiveLessons(
        { ...goal, noteIds: ["missing"] },
        knowledge(),
        emptyProjectCatalog(),
      ),
    /больше недоступен/,
  );
});

test("project selection uses only that user's chosen project and its actual topic answers", () => {
  const catalog = projectFixture();
  const lessons = buildIntensiveLessons(
    { ...goal, noteIds: [], projectIds: ["second"] },
    knowledge(),
    catalog,
  );
  assert.equal(lessons.length, 3);
  assert(lessons.every((lesson) => lesson.projectId === "second"));
  assert.equal(lessons[0]!.questions.length, 3);
  assert.equal(
    lessons[0]!.questions[0]!.answer,
    catalog.topics.find((topic) => topic.id === "second-main")!.pilot
      .questions[0]!.short,
  );
  assert.match(lessons[0]!.reading.href, /projectTopic=second-main/);
});

test("draft and accepted program persist with separate repeat/progress, reject stale writes and preserve preparation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "prep-lab-intensive-"));
  const path = join(directory, "instance.sqlite");
  let database = openDatabase(path);
  try {
    const beforePreparation = new PreparationRepository(database).read();
    let repository = new IntensiveRepository(database);
    const service = new IntensiveService({
      repository,
      knowledge: async () => knowledge(),
      projects: emptyProjectCatalog,
    });
    const draft = await service.draft(goal, 0);
    assert.equal(draft.state.plan, null);
    assert.equal(draft.state.draft!.lessons.length, 2);
    database.close();
    database = openDatabase(path);
    repository = new IntensiveRepository(database);
    const restarted = new IntensiveService({
      repository,
      knowledge: async () => knowledge(),
      projects: emptyProjectCatalog,
    });
    assert.deepEqual(restarted.read(), draft);
    const ids = draft.state.draft!.lessons.map((lesson) => lesson.id).reverse();
    const accepted = await restarted.accept(ids, draft.revision);
    assert.deepEqual(
      accepted.state.plan!.lessons.map((lesson) => lesson.id),
      ids,
    );
    assert.equal(accepted.state.draft, null);
    const progress = restarted.updateProgress(
      "note:sql",
      {
        status: "in-progress",
        drafts: { q0: "SELECT key" },
        notes: "Проверить NULL",
        step: "practice",
        questionId: "q2",
        outcome: "assisted",
      },
      accepted.revision,
    );
    assert.equal(progress.state.progress["note:sql"]!.step, "practice");
    assert.equal(progress.state.progress["note:sql"]!.questionId, "q2");
    assert.throws(
      () =>
        restarted.updateProgress(
          "note:sql",
          { status: "done", drafts: {}, notes: "" },
          accepted.revision,
        ),
      RevisionConflict,
    );
    const repeated = restarted.addRepeat(
      "note:sql",
      "Повторить GROUP BY",
      progress.revision,
    );
    assert.deepEqual(repeated.state.plan, accepted.state.plan);
    assert.deepEqual(repeated.state.progress, progress.state.progress);
    assert.deepEqual(
      new PreparationRepository(database).read(),
      beforePreparation,
    );
    database.close();
    database = openDatabase(path);
    assert.deepEqual(new IntensiveRepository(database).read(), repeated);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("additions preserve completed snapshots and drafts while adding newly imported questions", async () => {
  const database = openDatabase(":memory:");
  try {
    const currentKnowledge = knowledge();
    const service = new IntensiveService({
      repository: new IntensiveRepository(database),
      knowledge: async () => currentKnowledge,
      projects: emptyProjectCatalog,
    });
    const draft = await service.draft({ ...goal, noteIds: ["sql"] }, 0);
    const accepted = await service.accept(["note:sql"], draft.revision);
    const completed = service.updateProgress(
      "note:sql",
      {
        status: "done",
        drafts: { q0: "Мой ответ" },
        notes: "",
        step: "result",
        outcome: "applied",
      },
      accepted.revision,
    );
    const original = completed.state.plan!.lessons[0];
    currentKnowledge.questions.push(question("new-question"));
    const additions = await service.draft(goal, completed.revision);
    assert.equal(additions.state.draft!.lessons.length, 2);
    const supplement = additions.state.draft!.lessons.find((lesson) =>
      lesson.id.startsWith("supplement:"),
    )!;
    assert.deepEqual(
      supplement.questions.map((item) => item.id),
      ["new-question"],
    );
    const next = await service.accept(
      additions.state.draft!.lessons.map((lesson) => lesson.id),
      additions.revision,
    );
    assert.deepEqual(next.state.plan!.lessons[0], original);
    assert.deepEqual(next.state.progress, completed.state.progress);
    assert.equal(next.state.plan!.lessons.length, 3);
    await assert.rejects(service.draft(goal, next.revision), /уже включены/);
    assert.deepEqual(service.read(), next);
  } finally {
    database.close();
  }
});

test("unreviewed, duplicate, foreign or changed lesson content cannot activate or overwrite accepted progress", async () => {
  const database = openDatabase(":memory:");
  try {
    const base = knowledge();
    const service = new IntensiveService({
      repository: new IntensiveRepository(database),
      knowledge: async () => base,
      projects: emptyProjectCatalog,
    });
    await assert.rejects(service.accept(["note:sql"], 0), /Сначала составьте/);
    await assert.rejects(
      service.propose(goal, ["file:///secret"], 0),
      /вне выбранных/,
    );
    await assert.rejects(service.propose(goal, ["note:sql", "note:sql"], 0));
    assert.equal(service.read().revision, 0);
    const draft = await service.draft(goal, 0);
    await assert.rejects(
      service.accept(["note:unknown"], draft.revision),
      /вне выбранных/,
    );
    base.notes[0]!.markdown += "\nИзменение после просмотра.";
    await assert.rejects(
      service.accept(["note:sql"], draft.revision),
      /Материалы изменились/,
    );
    assert.deepEqual(service.read(), draft);
    const refreshed = await service.draft(goal, draft.revision);
    const accepted = await service.accept(["note:sql"], refreshed.revision);
    assert.throws(
      () =>
        service.updateProgress(
          "note:backend",
          { status: "done", drafts: {}, notes: "" },
          accepted.revision,
        ),
      /не найдено/,
    );
    assert.throws(
      () =>
        service.updateProgress(
          "note:sql",
          { status: "done", drafts: { foreign: "answer" }, notes: "" },
          accepted.revision,
        ),
      /другому занятию/,
    );
    assert.deepEqual(service.read(), accepted);
  } finally {
    database.close();
  }
});

test("changed reading-only material creates one supplement and preserves the completed original", async () => {
  const database = openDatabase(":memory:");
  try {
    const base = knowledge();
    const selected = { ...goal, noteIds: ["backend"] };
    const service = new IntensiveService({
      repository: new IntensiveRepository(database),
      knowledge: async () => base,
      projects: emptyProjectCatalog,
    });
    const draft = await service.draft(selected, 0);
    const accepted = await service.accept(["note:backend"], draft.revision);
    const completed = service.updateProgress(
      "note:backend",
      {
        status: "done",
        drafts: {},
        notes: "Разобрал транзакцию",
        step: "result",
        outcome: "read",
      },
      accepted.revision,
    );
    base.notes[1]!.markdown +=
      "\n\n## Изоляция\n\nРазберите неповторяемое чтение.";
    const supplement = await service.draft(selected, completed.revision);
    const lesson = supplement.state.draft!.lessons[0]!;
    assert.equal(supplement.state.draft!.lessons.length, 1);
    assert.equal(lesson.questions.length, 0);
    assert.match(lesson.reading.markdown, /неповторяемое чтение/);
    assert.equal((await service.preview(selected)).lessons[0]!.id, lesson.id);
    const updated = await service.accept([lesson.id], supplement.revision);
    assert.deepEqual(
      updated.state.plan!.lessons[0],
      completed.state.plan!.lessons[0],
    );
    assert.deepEqual(updated.state.progress, completed.state.progress);
    await assert.rejects(service.preview(selected), /уже включены/);
  } finally {
    database.close();
  }
});

test("changed existing answers are supplemented once without duplicating unchanged questions and content cycles have distinct IDs", async () => {
  const database = openDatabase(":memory:");
  try {
    const base = knowledge();
    const selected = { ...goal, noteIds: ["sql"] };
    const service = new IntensiveService({
      repository: new IntensiveRepository(database),
      knowledge: async () => base,
      projects: emptyProjectCatalog,
    });
    const draft = await service.draft(selected, 0);
    let accepted = await service.accept(["note:sql"], draft.revision);
    const original = accepted.state.plan!.lessons[0]!;
    const ids = new Set<string>();
    for (const answer of [
      "Уточнение про HAVING.",
      "Сгруппируйте строки по ключу.",
      "Уточнение про HAVING.",
    ]) {
      base.questions[0]!.answer = answer;
      const update = await service.draft(selected, accepted.revision);
      const lesson = update.state.draft!.lessons[0]!;
      assert.deepEqual(
        lesson.questions.map((item) => item.id),
        ["q0"],
      );
      assert.equal(lesson.questions[0]!.answer, answer);
      assert(!ids.has(lesson.id));
      ids.add(lesson.id);
      accepted = await service.accept([lesson.id], update.revision);
      assert.deepEqual(accepted.state.plan!.lessons[0], original);
      await assert.rejects(service.preview(selected), /уже включены/);
    }
  } finally {
    database.close();
  }
});

test("a supplement cannot replace the active program goal or hide already completed work under a different direction", async () => {
  const database = openDatabase(":memory:");
  try {
    const base = knowledge();
    const service = new IntensiveService({
      repository: new IntensiveRepository(database),
      knowledge: async () => base,
      projects: emptyProjectCatalog,
    });
    const originalGoal = {
      ...goal,
      noteIds: ["sql"],
      vacancy: "SQL и метрики",
      interviewDate: "2026-12-01",
    };
    const draft = await service.draft(originalGoal, 0);
    const accepted = await service.accept(["note:sql"], draft.revision);
    for (const changes of [
      { title: "Другой интенсив" },
      { direction: "Backend" },
      { vacancy: "Другая вакансия" },
      { interviewDate: "2026-12-02" },
    ]) {
      await assert.rejects(
        service.draft(
          { ...originalGoal, noteIds: ["backend"], ...changes },
          accepted.revision,
        ),
        /Дополнение относится к текущей цели/,
      );
      assert.deepEqual(service.read(), accepted);
    }
    const update = await service.draft(
      { ...originalGoal, noteIds: ["backend"] },
      accepted.revision,
    );
    const next = await service.accept(["note:backend"], update.revision);
    assert.deepEqual(next.state.plan!.goal, {
      ...originalGoal,
      noteIds: ["sql", "backend"],
    });
  } finally {
    database.close();
  }
});

test("corrupt saved intensive is never silently replaced by an empty state", () => {
  const database = openDatabase(":memory:");
  try {
    database
      .prepare("INSERT INTO instance_meta VALUES ('intensive:v1',?)")
      .run('{"broken":true}');
    const repository = new IntensiveRepository(database);
    assert.throws(() => repository.read());
    assert.throws(() => repository.update(0, (state) => state));
    assert.equal(
      database
        .prepare("SELECT value FROM instance_meta WHERE key='intensive:v1'")
        .pluck()
        .get(),
      '{"broken":true}',
    );
  } finally {
    database.close();
  }
});

test("intensive HTTP validates origins, request methods and foreign proposal IDs, and supports prompt preview without mutation", async () => {
  const database = openDatabase(":memory:");
  const service = new IntensiveService({
    repository: new IntensiveRepository(database),
    knowledge: async () => knowledge(),
    projects: emptyProjectCatalog,
  });
  const server = createServer(async (request, response) => {
    await handleIntensive(request, response, service);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, origin = base) =>
    fetch(base + "/api/intensive" + path, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (
        await post(
          "/draft",
          { goal, expectedRevision: 0 },
          "https://external.example",
        )
      ).status,
      403,
    );
    const prompt = await post("/prompt", { goal });
    assert.equal(prompt.status, 200);
    assert.match((await prompt.json()).prompt, /SQL для аналитика/);
    assert.equal(service.read().revision, 0);
    assert.equal(
      (
        await post("/propose", {
          goal,
          lessonIds: ["fake"],
          expectedRevision: 0,
        })
      ).status,
      400,
    );
    const response = await post("/draft", { goal, expectedRevision: 0 });
    assert.equal(response.status, 200);
    const draft = (await response.json()) as IntensiveSnapshot;
    assert.equal(
      (await post("/accept", { lessonIds: ["note:sql"], expectedRevision: 0 }))
        .status,
      409,
    );
    assert.equal(
      (
        await post("/accept", {
          lessonIds: ["note:sql"],
          expectedRevision: draft.revision,
        })
      ).status,
      200,
    );
    assert.equal(
      (await fetch(base + "/api/intensive/draft", { method: "DELETE" })).status,
      405,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    database.close();
  }
});
