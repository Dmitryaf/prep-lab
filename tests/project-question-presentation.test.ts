import test from "node:test";
import assert from "node:assert/strict";
import { projectFixture } from "./fixtures/projects.ts";
import { projectQuestions } from "../app/entities/project/model/questions.ts";

test("project questions keep their context without injecting authorship disclaimers", () => {
  const catalog = projectFixture();
  const before = structuredClone(catalog);
  const cards = projectQuestions(
    catalog.topics,
    catalog.projects,
    catalog.experience,
  );
  assert(cards.length > 0);
  assert.equal(cards[0].prompt, "Вход: Контракт операции");
  assert.equal(
    cards[0].criteria,
    "Объясняю задачу, свою часть работы, решение и альтернативу, сложность и способ проверки результата.",
  );
  assert.doesNotMatch(
    JSON.stringify(cards),
    /Отделите собственную|не подтверждает личное авторство|Разделяю подтверждённые факты/,
  );
  assert.deepEqual(catalog, before);
});

test("project cards retain authored notices, criteria and commercial facts", () => {
  const catalog = projectFixture();
  catalog.experience.first = {
    kind: "commercial",
    notice: "Работа над клиентской частью.",
  };
  const topic = catalog.topics[0];
  topic.pilot.questions[0].criteria = "Проверить обратный порядок ответов.";
  topic.story = {
    short: "Реализовал обработку отмены запроса.",
    deep: [],
    confirmed: "",
    assumptions: "",
    reconstruction: "",
    boundaries: "Серверный API разрабатывала другая команда.",
  };
  const before = structuredClone(catalog);
  const [card] = projectQuestions(
    [topic],
    catalog.projects,
    catalog.experience,
  );
  assert.equal(card.prompt, card.title + "\n\nРабота над клиентской частью.");
  assert.equal(card.answer, topic.pilot.questions[0].short);
  assert.equal(card.criteria, topic.pilot.questions[0].criteria);
  assert.match(card.details!, /Серверный API разрабатывала другая команда/);
  assert.equal(card.topicId, topic.id);
  assert.deepEqual(catalog, before);
});
