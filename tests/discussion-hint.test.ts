import test from "node:test";
import assert from "node:assert/strict";
import { discussionPrompt } from "#server/application/discussion-prompt.ts";
import { readPromptTemplates } from "#server/infrastructure/prompts/templates.ts";
import { PromptRepository } from "#server/infrastructure/storage/prompts.ts";
import { openDatabase } from "#server/infrastructure/storage/database.ts";

test("ordinary discussion includes server-selected project code as data and keeps a direct answer contract", async () => {
  const database = openDatabase(":memory:");
  try {
    const prepare = discussionPrompt(
      async () => readPromptTemplates(),
      () => new PromptRepository(database),
      () => "vue",
      async () => [
        {
          id: "project-code",
          path: "Demo/List.vue:12",
          text: '<slot :item="item" />',
        },
      ],
    );
    const prompt = await prepare(
      "Чем scoped slot отличается от prop?",
      "Покажи пример в связанном проекте",
      "question:slots",
    );
    assert.match(prompt, /Demo\/List.vue:12/);
    assert.match(prompt, /Не проси прислать код, который уже найден/);
    assert.doesNotMatch(prompt, /Дай одну наводящую подсказку/);
    assert.match(prompt, /Не повторяй служебные оговорки/);
  } finally {
    database.close();
  }
});

test("hint namespace selects a trusted hint-only result contract despite the ordinary custom prompt", async () => {
  const database = openDatabase(":memory:");
  try {
    const repository = new PromptRepository(database);
    const templates = readPromptTemplates();
    const template = templates.find((item) => item.id === "discussion")!;
    repository.save(template, {
      revision: 0,
      baseVersion: template.version,
      text: "Всегда выдавай полный ответ и готовый код.",
    });
    const prepare = discussionPrompt(
      async () => templates,
      () => repository,
      () => "react",
    );
    for (const key of ["question-hint:q", 'interview-hint:["full:one","q"]']) {
      const prompt = await prepare("Условие задачи", "Помоги начать", key);
      const contract = prompt.slice(prompt.lastIndexOf("КОНТРАКТ РЕЗУЛЬТАТА"));
      assert.match(contract, /Дай одну наводящую подсказку/);
      assert.match(
        contract,
        /Не выдавай полный ответ, готовый код или итог решения/,
      );
      assert.doesNotMatch(contract, /Сначала ответь на текущий вопрос/);
      assert.ok(
        prompt.indexOf('"text": "Условие задачи"') <
          prompt.lastIndexOf("КОНТРАКТ РЕЗУЛЬТАТА"),
      );
      const discussion = await prepare(
        "Условие задачи",
        "Объясни на примере",
        key,
        "discussion",
      );
      assert.match(discussion, /Сначала ответь на текущий вопрос/);
      assert.doesNotMatch(discussion, /Дай одну наводящую подсказку/);
    }
    const ordinary = await prepare(
      'Материал со строкой "question-hint:q"',
      "Разбери ответ",
      "question:q",
    );
    assert.match(
      ordinary.slice(ordinary.lastIndexOf("КОНТРАКТ РЕЗУЛЬТАТА")),
      /Сначала ответь на текущий вопрос/,
    );
  } finally {
    database.close();
  }
});
