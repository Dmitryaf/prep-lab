import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  AnalysisService,
  analysisBatches,
} from "#server/application/analysis.ts";
import { AnalysisRepository } from "#server/infrastructure/storage/analyses.ts";
import { openDatabase } from "#server/infrastructure/storage/database.ts";
import { extractQuestions } from "#domain/knowledge/markdown.ts";
import type { Knowledge, Note } from "#domain/knowledge/material.ts";
import type {
  AnalysisRequest,
  AnalysisJob,
} from "#domain/analysis/contracts.ts";
import type { ProjectDraft } from "#domain/projects/draft.ts";
import type { ProjectCatalog } from "#domain/projects/catalog.ts";
import type { Answer } from "#server/types.ts";

const upload = (path: string, text: string) => ({
  path,
  encoding: "base64" as const,
  content: Buffer.from(text).toString("base64"),
});
const request = (changes: Partial<AnalysisRequest> = {}): AnalysisRequest => ({
  scenario: "project",
  profile: "vue",
  paths: [],
  files: [upload("src/app.ts", "export const value = 1;\n")],
  context: "",
  ...changes,
});
const questionMarkdown = (title: string, answer: string) =>
  `# Учебная тема\n\n## ${title}\n\n> [!answer]- Ответ\n> ${answer}\n`;
function knowledge(): Knowledge {
  const notes: Note[] = [
    {
      id: "note:closures",
      path: "Собеседования/Темы/JavaScript/Замыкания.md",
      title: "Замыкания",
      category: "JavaScript",
      markdown: questionMarkdown(
        "Что такое замыкание?",
        "Функция сохраняет доступ к внешним переменным.",
      ),
    },
    {
      id: "note:errors",
      path: "Собеседования/Темы/JavaScript/Ошибки.md",
      title: "Ошибки",
      category: "JavaScript",
      markdown: questionMarkdown(
        "Как обработать ошибку?",
        "Обработать ожидаемый сбой и сохранить данные.",
      ),
    },
  ];
  const questions = notes
    .flatMap((note) => extractQuestions(note))
    .map((q, i) => ({ ...q, id: `legacy-question-${i}` }));
  return { notes, questions, route: questions.map((q) => q.id), warnings: [] };
}
function setup(answer: Answer, base = knowledge()) {
  const db = openDatabase(":memory:"),
    repository = new AnalysisRepository(db);
  const service = new AnalysisService({
    repository,
    answer,
    knowledge: async () => repository.knowledge(base),
  });
  return {
    db,
    repository,
    service,
    base,
    async close() {
      await service.close();
      db.close();
    },
  };
}
async function settled(service: AnalysisService, job: AnalysisJob) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const value = service.read(job.id);
    if (value.status !== "running") {
      await delay(0);
      return value;
    }
    await delay(2);
  }
  throw new Error("Test analysis did not settle");
}
function phase(task = "") {
  return task.match(/ANALYSIS_PHASE:([^\n]+)/)?.[1];
}
function projectResult(context: {
  inventory: { id: string }[];
  previousProject?: { topics: { id: string; questions: { id: string }[] }[] };
}): ProjectDraft {
  const previous = context.previousProject?.topics[0];
  return {
    schemaVersion: 1,
    name: "Тестовый редактор",
    summary: "Редактор сохраняет записи пользователя.",
    stack: ["TypeScript"],
    roleFacts: [],
    unknowns: [],
    map: {
      nodes: [
        {
          id: "save",
          label: "Сохранение записи",
          kind: "scenario",
          description: "Пользователь сохраняет запись",
          topicIndexes: [0],
        },
        {
          id: "ts",
          label: "TypeScript",
          kind: "technology",
          description: "Типы входных данных",
          topicIndexes: [0],
        },
      ],
      edges: [
        { from: "save", to: "ts", kind: "uses", label: "проверяет типы" },
      ],
    },
    topics: [
      {
        ...(previous ? { previousTopicId: previous.id } : {}),
        title: "Как сохраняется запись",
        explanation: "Вход проходит проверку перед сохранением.",
        mechanism: ["Проверить запись", "Сохранить результат"],
        tradeoff: "Ошибку нужно показать рядом с полем.",
        questions: [
          {
            ...(previous
              ? { previousQuestionId: previous.questions[0].id }
              : {}),
            question: "Что происходит при сохранении?",
            answer: "Данные проверяются и сохраняются.",
            criteria: "Назвать проверку и запись.",
          },
        ],
        codeReferences: [
          {
            sourceId: context.inventory[0].id,
            startLine: 1,
            endLine: 1,
            explanation: "Контракт записи",
          },
        ],
      },
    ],
  };
}

test("project analysis stages complete files, accepts a map and reuses unchanged observations while preserving IDs", async () => {
  const calls: { phase?: string; context: Record<string, unknown> }[] = [];
  const state = setup(async ({ trustedTask, context }) => {
    const input = JSON.parse(context);
    const current = phase(trustedTask);
    calls.push({ phase: current, context: input });
    if (current === "project-observe")
      return JSON.stringify({
        summary:
          "Исследован код " +
          JSON.stringify(input.materials.map((m: { id: string }) => m.id)),
      });
    assert.equal(current, "project-final");
    return JSON.stringify(projectResult(input));
  });
  try {
    const files = ["a.ts", "b.ts", "c.ts"].map((path) =>
      upload(path, "export const value = 1;\n//" + "x".repeat(70000)),
    );
    const initial = await settled(
      state.service,
      await state.service.start(request({ files })),
    );
    assert.equal(initial.status, "ready", initial.error);
    const observeCount = calls.filter(
      (c) => c.phase === "project-observe",
    ).length;
    assert(observeCount > 1);
    assert.equal(
      state.db
        .prepare(
          "SELECT COUNT(*) FROM instance_meta WHERE key LIKE 'project:%'",
        )
        .pluck()
        .get(),
      0,
    );
    const accepted = await state.service.accept(initial.id, []);
    const readProject = () =>
      JSON.parse(
        String(
          state.db
            .prepare("SELECT value FROM instance_meta WHERE key=?")
            .pluck()
            .get("project:" + accepted.projectId),
        ),
      ) as ProjectCatalog;
    const first = readProject();
    assert.deepEqual(first.projects[accepted.projectId!].stack, ["TypeScript"]);
    assert(first.projects[accepted.projectId!].map?.nodes.length);
    const unchanged = await state.service.start(
      request({ files, connectionId: initial.connectionId }),
    );
    assert.equal(unchanged.status, "unchanged");
    assert.equal(calls.length, observeCount + 1);
    files[2] = upload(
      "c.ts",
      "export const value = 2;\n//" + "y".repeat(70000),
    );
    const updated = await settled(
      state.service,
      await state.service.start(
        request({ files, connectionId: initial.connectionId }),
      ),
    );
    assert.equal(updated.status, "ready", updated.error);
    assert.equal(updated.changedFileCount, 1);
    const newObservations =
      calls.filter((c) => c.phase === "project-observe").length - observeCount;
    assert(newObservations > 0 && newObservations < observeCount);
    const next = await state.service.accept(updated.id, []);
    assert.equal(next.projectId, accepted.projectId);
    assert.equal(readProject().topics[0].id, first.topics[0].id);
    assert.equal(
      readProject().topics[0].pilot.questions[0].id,
      first.topics[0].pilot.questions[0].id,
    );
    assert.deepEqual(
      (await state.service.accept(updated.id, [])).projectId,
      next.projectId,
    );
    assert.equal(
      state.db
        .prepare(
          "SELECT COUNT(*) FROM instance_meta WHERE key LIKE 'project:%'",
        )
        .pluck()
        .get(),
      1,
    );
  } finally {
    await state.close();
  }
});

test("knowledge analysis compares full current notes and selectively accepts changes without changing source files or question IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "lab-analysis-service-"));
  const source =
    "# Заметки\nНовый пример замыкания и отличающийся разбор ошибки.";
  const base = knowledge(),
    original = structuredClone(base);
  let comparedCurrent = false;
  const updated = questionMarkdown(
    "Что такое замыкание?",
    "Функция сохраняет доступ к внешним переменным. Счётчик сохраняет своё значение между вызовами.",
  );
  const state = setup(async ({ trustedTask, context }) => {
    const input = JSON.parse(context);
    if (phase(trustedTask) === "import-match")
      return JSON.stringify({ noteIds: base.notes.map((n) => n.id) });
    assert.equal(phase(trustedTask), "import-compare");
    assert.deepEqual(input.notes, base.notes);
    comparedCurrent = true;
    return JSON.stringify({
      changes: [
        {
          action: "update",
          targetId: base.notes[0].id,
          title: "Замыкания",
          markdown: updated,
          reason: "Добавлен пример счётчика",
        },
        {
          action: "add",
          title: "Отмена запроса",
          markdown: questionMarkdown(
            "Как отменить запрос?",
            "Использовать AbortController.",
          ),
          reason: "Новая тема",
        },
        {
          action: "conflict",
          targetId: base.notes[1].id,
          title: "Ошибки",
          markdown: questionMarkdown(
            "Как обработать ошибку?",
            "Другой вариант.",
          ),
          reason: "Разные рекомендации",
        },
        {
          action: "skip",
          title: "Повтор",
          markdown: "",
          reason: "Уже есть в базе",
        },
      ],
    });
  }, base);
  try {
    await writeFile(join(root, "Notes.md"), source);
    const job = await settled(
      state.service,
      await state.service.start(
        request({ scenario: "import", paths: [root], files: [] }),
      ),
    );
    assert.equal(job.status, "ready", job.error);
    assert(comparedCurrent);
    assert.deepEqual(state.repository.knowledge(base), original);
    const selected = job.changes
      .filter((c) => ["add", "update"].includes(c.action))
      .map((c) => c.id);
    await state.service.accept(job.id, selected);
    const result = state.repository.knowledge(base);
    assert.equal(result.notes.length, 3);
    const added = result.notes.find((note) => note.title === "Отмена запроса")!;
    assert.equal(
      result.questions.find((q) => q.noteId === added.id)?.title,
      "Как отменить запрос?",
    );
    assert.equal(
      result.notes.find((n) => n.id === base.notes[0].id)?.markdown,
      updated,
    );
    assert.equal(
      result.notes.find((n) => n.id === base.notes[1].id)?.markdown,
      base.notes[1].markdown,
    );
    assert.equal(
      result.questions.find((q) => q.noteId === base.notes[0].id)?.id,
      base.questions[0].id,
    );
    assert.deepEqual(result.route, base.route);
    assert.deepEqual(base, original);
    assert.equal(await readFile(join(root, "Notes.md"), "utf8"), source);
  } finally {
    await state.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("invalid assistant answers and cancelled analysis never update accepted content", async () => {
  const invalid = setup(async () => "not JSON");
  try {
    const job = await settled(
      invalid.service,
      await invalid.service.start(request()),
    );
    assert.equal(job.status, "failed");
    await assert.rejects(invalid.service.accept(job.id, []), /готов/);
    assert.equal(invalid.repository.revision(), 0);
    assert.deepEqual(invalid.repository.knowledge(invalid.base), invalid.base);
  } finally {
    await invalid.close();
  }
  let called = 0,
    signalReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  const cancelled = setup(async ({ signal }) => {
    called++;
    signalReady();
    await new Promise<void>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    );
    return "";
  });
  try {
    const job = await cancelled.service.start(request());
    await ready;
    await assert.rejects(cancelled.service.start(request()), /выполняется/);
    cancelled.service.cancel(job.id);
    assert.equal((await settled(cancelled.service, job)).status, "cancelled");
    assert.equal(called, 1);
    assert.equal(cancelled.repository.revision(), 0);
    assert.deepEqual(
      cancelled.repository.knowledge(cancelled.base),
      cancelled.base,
    );
  } finally {
    await cancelled.close();
  }
});

test("restart recovery never resends a model request and revision conflicts reject stale acceptance", async () => {
  const state = setup(async ({ trustedTask, context }) =>
    phase(trustedTask) === "project-observe"
      ? JSON.stringify({ summary: "Observed source" })
      : JSON.stringify(projectResult(JSON.parse(context))),
  );
  try {
    const job = await settled(
      state.service,
      await state.service.start(request()),
    );
    assert.equal(job.status, "ready", job.error);
    const pending = state.repository.read(job.id);
    pending.job = {
      ...pending.job,
      id: randomUUID(),
      status: "running",
      stage: "В работе",
    };
    state.repository.save(pending);
    let calls = 0;
    const restarted = new AnalysisService({
      repository: state.repository,
      knowledge: async () => state.base,
      answer: async () => {
        calls++;
        throw new Error("Unexpected inference");
      },
    });
    assert.equal(restarted.read(pending.job.id).status, "cancelled");
    assert.equal(calls, 0);
    state.db
      .prepare(
        "UPDATE instance_meta SET value='1' WHERE key='content_revision'",
      )
      .run();
    await assert.rejects(restarted.accept(job.id, []), /изменилась/);
    assert.equal(
      state.db
        .prepare(
          "SELECT COUNT(*) FROM instance_meta WHERE key LIKE 'project:%'",
        )
        .pluck()
        .get(),
      0,
    );
    assert.equal(restarted.read(job.id).status, "ready");
    await restarted.close();
  } finally {
    await state.close();
  }
});

test("analysis batches retain every line and source offset", () => {
  const text = Array.from(
    { length: 300 },
    (_, index) => `${index}: ${"x".repeat(600)}`,
  ).join("\n");
  const parts = analysisBatches([
    { id: "source", path: "src.ts", text },
  ]).flat();
  assert(parts.length > 1);
  const original = text.split("\n");
  const covered: number[] = [];
  for (const part of parts) {
    const lines = part.text.split("\n");
    assert.deepEqual(
      lines,
      original.slice(part.startLine - 1, part.startLine - 1 + lines.length),
    );
    covered.push(...lines.map((_, offset) => part.startLine + offset));
  }
  assert.deepEqual(
    covered,
    original.map((_, index) => index + 1),
  );
});

test("unchanged source files are compared again when the active knowledge base changes", async () => {
  const base = knowledge();
  let comparisons = 0;
  const state = setup(async ({ trustedTask }) => {
    if (phase(trustedTask) === "import-match")
      return JSON.stringify({ noteIds: [] });
    comparisons++;
    return JSON.stringify({
      changes: [
        {
          action: "skip",
          title: "Повтор",
          markdown: "",
          reason: "Тема уже разобрана",
        },
      ],
    });
  }, base);
  try {
    const input = request({
      scenario: "import",
      files: [upload("Note.md", "# Заметка\nЗамыкания")],
    });
    const first = await settled(
      state.service,
      await state.service.start(input),
    );
    assert.equal(first.status, "ready", first.error);
    await state.service.accept(first.id, []);
    const same = await state.service.start({
      ...input,
      connectionId: first.connectionId,
    });
    assert.equal(same.status, "unchanged");
    assert.equal(comparisons, 1);
    base.notes[0].markdown += "\nНовый материал из другой папки.\n";
    const next = await settled(
      state.service,
      await state.service.start({ ...input, connectionId: first.connectionId }),
    );
    assert.equal(next.status, "ready", next.error);
    assert.equal(next.changedFileCount, 0);
    assert.equal(comparisons, 2);
  } finally {
    await state.close();
  }
});
