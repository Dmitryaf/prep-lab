import type { Topic, Project } from "../../domain/projects/types.ts";
import type { ProjectCatalog } from "../../domain/projects/catalog.ts";

// Synthetic data for portable project scenarios; no personal work history or source files.
export function projectFixture(): ProjectCatalog {
  const projects: Record<string, Project> = {};
  const topics: Topic[] = [];
  for (const [id, name] of [
    ["first", "Первый пример"],
    ["second", "Второй пример"],
  ]) {
    const ids = [id + "-main", id + "-storage", id + "-errors"];
    projects[id] = {
      id,
      name,
      subtitle: "Тестовый каталог",
      pitch: "Искусственный пример для проверки интерфейса.",
      icon: "◈",
      repo: id,
      branch: "main",
      color: "#2266aa",
      stack: ["TypeScript"],
      routes: [
        {
          id: id + "-route",
          name: "Основной маршрут",
          caption: "Три темы примера",
          nodes: ids,
        },
      ],
    };
    for (const [index, topicId] of ids.entries()) {
      const title = [
        "Контракт операции",
        "Хранение результата",
        "Обработка ошибки",
      ][index];
      topics.push({
        id: topicId,
        project: id,
        title,
        group: "Сценарии",
        priority: index === 2 ? "P1" : "P0",
        minutes: 6,
        summary: "Проверяемый учебный пример с явными границами.",
        context: "Данные принимает функция с типизированным входом.",
        mechanism: ["Проверить вход", "Получить результат"],
        decision: "Отделить проверку от записи.",
        tradeoff: "Явные шаги требуют отдельной обработки ошибок.",
        question: "Как проверить контракт операции?",
        answer:
          "Проверить допустимый вход, отказ и сохранность принятого результата.",
        failures: ["Некорректный вход"],
        interview: ["Что произойдёт при повторе?"],
        sources: [],
        theory: [
          [
            "Фронтенд/TypeScript/07. API, unknown и проверка данных.md",
            "Проверка данных",
          ],
        ],
        related: ids.filter((other) => other !== topicId),
        pilot: {
          id: topicId,
          title,
          explanation: {
            intro: "Учебный пример, не описание чьего-либо опыта.",
            steps: [
              { title: "Вход", text: "Проверка формы данных." },
              { title: "Выход", text: "Проверка результата." },
            ],
          },
          study: [
            {
              path: "Фронтенд/TypeScript/07. API, unknown и проверка данных.md",
              label: "Проверка данных",
              why: "Объясняет границу внешнего входа.",
            },
          ],
          questions: ["Вход", "Результат", "Ошибка"].map((label, number) => ({
            id: "q" + number,
            question: label + ": " + title,
            short: "Проверить контракт через наблюдаемый результат.",
            detailed: ["Указать допустимый вход и ожидаемый исход."],
            example: "Некорректный вход не меняет принятую запись.",
          })),
          code: {
            intro:
              "Искусственная ссылка для проверки представления; чтение исходника не заявляется.",
            steps: [
              {
                project: id,
                path: "src/example.ts",
                line: 1,
                symbol: "validateInput",
                title: "Проверка входа",
                explanation: "Граница данных.",
              },
            ],
            tests: [],
          },
        },
      });
    }
  }
  return {
    projects,
    topics,
    codeHighlights: {},
    repositories: {},
    sourceLabels: {},
    experience: {},
    defaultProject: "first",
    defaultRoute: "first-route",
  };
}
