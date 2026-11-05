import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/infrastructure/storage/database.ts";
import { GenerationRepository } from "../server/infrastructure/storage/generations.ts";
import { ProjectRepository } from "../server/infrastructure/storage/reviewed-projects.ts";
import { GenerationService } from "../server/application/generations.ts";
import { PromptRepository } from "../server/infrastructure/storage/prompts.ts";
import { SourceRepository } from "../server/infrastructure/storage/sources.ts";
import { SourceService } from "../server/application/sources.ts";
import { readPromptTemplates } from "../server/infrastructure/prompts/templates.ts";
import { emptyProjectCatalog } from "../domain/projects/catalog.ts";
import type { Answer } from "../server/types.ts";
import type { ProjectDraft } from "../domain/projects/draft.ts";
import { projectQuestions } from "../app/entities/project/model/questions.ts";
import { projectFromDraft } from "../domain/projects/from-draft.ts";
const draft: ProjectDraft = {
  schemaVersion: 1,
  name: "Учебный сервис",
  summary: "Сервис обрабатывает записи через проверяемый контракт.",
  roleFacts: [],
  unknowns: ["Какие части реализовал пользователь?"],
  topics: [
    {
      title: "Проверка входа",
      explanation:
        "Вход проверяется перед записью, поэтому неверные данные не заменяют принятые.",
      mechanism: ["Проверить вход", "Записать допустимые данные"],
      tradeoff: "Нужно согласованно показывать ошибки проверки.",
      questions: [
        {
          question: "Зачем проверять вход до записи?",
          answer: "Чтобы сохранить принятые данные при неверном входе.",
          criteria: "Назвать вход, проверку и сохранность прежнего результата.",
        },
      ],
      codeReferences: [],
    },
  ],
};
const input = {
  profile: "vue" as const,
  request: "Разбери проект",
  context: "",
  materials: [],
};

test("accepted role facts remain separate from the technical explanation", () => {
  let sequence = 0;
  const roleFacts: ProjectDraft["roleFacts"] = [
    {
      text: "Добавил сохранение черновика.",
      basis: "user_statement",
      sourceId: null,
    },
    {
      text: "Разработал поиск по заметкам.",
      basis: "document",
      sourceId: "experience",
    },
  ];
  const { catalog } = projectFromDraft(
    { ...draft, roleFacts },
    {
      ...input,
      context: roleFacts[0].text,
      materials: [
        { id: "experience", path: "Experience.md", text: roleFacts[1].text },
      ],
    },
    () => String(++sequence),
  );
  assert.equal(
    catalog.topics[0].story?.short,
    roleFacts.map((fact) => fact.text).join("\n"),
  );
  assert.deepEqual(catalog.topics[0].story?.deep, []);
  assert.equal(
    catalog.topics[0].pilot.explanation.intro,
    draft.topics[0].explanation,
  );
  assert.deepEqual(
    catalog.topics[0].pilot.explanation.steps.map((step) => step.text),
    draft.topics[0].mechanism,
  );
});
function setup(answer: Answer) {
  const db = openDatabase(":memory:");
  const repository = new GenerationRepository(db),
    projects = new ProjectRepository(db);
  const source = new SourceRepository(db);
  const service = new GenerationService({
    repository,
    projects,
    prompts: new PromptRepository(db),
    templates: async () => readPromptTemplates(),
    sources: new SourceService(source, async () => ({
      notes: [],
      questions: [],
      route: [],
      warnings: [],
    })),
    answer,
  });
  return { db, repository, projects, source, service };
}
test("a model result remains a draft until explicit atomic project acceptance", async () => {
  const { db, service, projects, repository } = setup(async ({ onDelta }) => {
    const text = JSON.stringify(draft);
    onDelta(text);
    return text;
  });
  try {
    const job = await service.run("project", input, () => {});
    assert.equal(job.status, "completed");
    assert.equal(projects.catalog(emptyProjectCatalog()).topics.length, 0);
    const accepted = await service.accept(job.id, draft, 0);
    assert(accepted.projectId);
    assert.equal(repository.read(job.id).status, "accepted");
    const catalog = projects.catalog(emptyProjectCatalog());
    assert.equal(catalog.topics.length, 1);
    assert.equal(catalog.topics[0].answer, draft.topics[0].questions[0].answer);
    const cards = projectQuestions(
      catalog.topics,
      catalog.projects,
      catalog.experience,
    );
    assert.equal(cards[0].criteria, draft.topics[0].questions[0].criteria);
    assert(!cards[0].details?.includes(cards[0].criteria));
    assert.equal(catalog.topics[0].story?.confirmed, "");
    assert.equal(catalog.experience[accepted.projectId].notice, undefined);
    assert.equal(catalog.topics[0].pilot.code.limitations, undefined);
    assert.equal(catalog.topics[0].story?.boundaries, "");
    assert.deepEqual(await service.accept(job.id, draft, 0), accepted);
  } finally {
    await service.close();
    db.close();
  }
});
test("invalid model output, invented code references and unreported authorship never publish projects", async () => {
  for (const output of [
    "not JSON",
    JSON.stringify({
      ...draft,
      topics: [
        {
          ...draft.topics[0],
          codeReferences: [
            {
              sourceId: "not-selected",
              startLine: 1,
              endLine: 5,
              explanation: "Неподтверждённый код",
            },
          ],
        },
      ],
    }),
    JSON.stringify({
      ...draft,
      roleFacts: [
        {
          text: "Я выбрал архитектуру",
          basis: "user_statement",
          sourceId: null,
        },
      ],
    }),
  ]) {
    const { db, service, projects } = setup(async () => output);
    try {
      const job = await service.run("project", input, () => {});
      assert.equal(job.status, "failed");
      assert.equal(job.draft, null);
      assert.equal(projects.catalog(emptyProjectCatalog()).topics.length, 0);
      await assert.rejects(service.accept(job.id, draft, 0));
    } finally {
      await service.close();
      db.close();
    }
  }
});
test("cancellation and restart retain partial output without a new answer request", async () => {
  let calls = 0;
  const { db, service, repository } = setup(async ({ signal, onDelta }) => {
    calls++;
    onDelta("Частичный ответ");
    await new Promise<void>((_, reject) =>
      signal.addEventListener("abort", () => reject(new Error("cancelled")), {
        once: true,
      }),
    );
    return "";
  });
  try {
    let id = "";
    const pending = service.run("project", input, (event) => {
      if (event.id) id = event.id;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await assert.rejects(
      service.run("project", input, () => {}),
      /уже|выполня/i,
    );
    service.cancel(id);
    const job = await pending;
    assert.equal(job.status, "interrupted");
    assert.equal(job.raw, "Частичный ответ");
    repository.recoverInterrupted();
    assert.equal(repository.read(id).status, "interrupted");
    assert.equal(calls, 1);
  } finally {
    await service.close();
    db.close();
  }
});
test("import generation creates a saved source preview and still requires source acceptance", async () => {
  const result = {
    schemaVersion: 1,
    documents: [
      {
        path: "Draft.md",
        markdown:
          "# Материал\n## Вопрос\n> [!answer]- Ответ\n> Понятный ответ.",
        kind: "theory",
        profile: "shared",
      },
    ],
  };
  const { db, service, source } = setup(async () => JSON.stringify(result));
  try {
    const job = await service.run(
      "import",
      { ...input, request: "Подготовь учебную заметку" },
      () => {},
    );
    const accepted = await service.accept(job.id, result, 0);
    assert(accepted.previewId);
    assert.equal(source.snapshot().sources.length, 0);
    assert.equal(source.preview(accepted.previewId).status, "pending");
  } finally {
    await service.close();
    db.close();
  }
});
