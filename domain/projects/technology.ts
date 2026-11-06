import type { Topic } from "./types.ts";

// General purpose is separate from examples extracted from this project's topics.
const purposes: Record<string, string> = {
  vue: "Vue собирает интерфейс из компонентов: шаблон показывает данные, события обрабатывают действия пользователя, а реактивность обновляет экран при изменении состояния.",
  react:
    "React собирает интерфейс из компонентов. Состояние и props определяют, что видит пользователь; обработчики событий запускают изменения, а эффекты связывают компоненты с внешними данными.",
  typescript:
    "TypeScript описывает структуру данных и контракты функций. Проверка типов помогает находить несовместимые значения до запуска; данные из API всё равно проверяются во время выполнения.",
  vuex: "Vuex хранит общее состояние Vue-приложения. Компоненты читают данные из store, actions выполняют операции, а mutations фиксируют изменения.",
  pinia:
    "Pinia хранит состояние, которое используют несколько Vue-компонентов. Store объединяет данные, вычисляемые значения и действия: например, загрузку, изменение и сохранение записи.",
  vuetify:
    "Vuetify предоставляет готовые Vue-компоненты: поля, таблицы, диалоги и элементы навигации. Формы собираются из этих компонентов, а правила заполнения и действия задаёт приложение.",
  "chart.js":
    "Chart.js отображает данные на диаграммах. Приложение подготавливает наборы данных, подписи и настройки, затем обновляет график при изменении фильтров или результатов запроса.",
  echarts:
    "ECharts строит интерактивные графики. Приложение передаёт серии данных, оси и настройки, обрабатывает выбор элементов и обновляет диаграмму при изменении данных.",
  dexie:
    "Dexie упрощает работу с IndexedDB в браузере: описывает таблицы и индексы, выполняет запросы и транзакции. Данные остаются на устройстве между открытиями приложения.",
  supabase:
    "Supabase предоставляет базу PostgreSQL, авторизацию и API для доступа к данным. Клиент работает от имени пользователя, а доступ к строкам задаётся правилами на сервере.",
  pwa: "PWA добавляет установку веб-приложения и работу с кешем через service worker. Интерфейс может открываться без сети; сохранение данных и последующая синхронизация требуют отдельной логики приложения.",
  fastify:
    "Fastify обрабатывает HTTP-запросы на сервере: маршруты принимают данные, проверяют их и вызывают прикладные операции. Ответ возвращается клиенту с нужным статусом и данными.",
  "node.js":
    "Node.js выполняет JavaScript и TypeScript-сервер после сборки: принимает запросы, работает с файлами, базой и внешними API. Асинхронный ввод-вывод позволяет обслуживать несколько операций одновременно.",
  sqlite:
    "SQLite хранит данные в локальном файле базы. SQL-запросы читают и изменяют записи, транзакции объединяют связанные изменения, а ограничения таблиц защищают целостность данных.",
  "telegram api":
    "Telegram API связывает сервис с ботом и чатами: принимает события и отправляет сообщения. Сервис сопоставляет идентификаторы чатов со своими данными и обрабатывает ошибки и повторные события.",
  "vk api":
    "VK API связывает сервис с сообщениями сообщества: принимает события, получает данные и отправляет ответы. Сервис хранит соответствие диалогов и учитывает ограничения и ошибки внешних запросов.",
};

export function technologyDetails(label: string, topics: Topic[]) {
  const name = label.toLowerCase().replace(/\s+\d[\d./]*$/, "");
  const terms = [name];
  if (name === "telegram api") terms.push("telegram");
  if (name === "vk api") terms.push("vk");
  const patterns = terms.map(
    (term) =>
      new RegExp(
        `(?<![\\p{L}\\p{N}_])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`,
        "iu",
      ),
  );
  const mentions = (text: string) =>
    patterns.some((pattern) => pattern.test(text));
  const examples = topics
    .map((topic) => {
      const paragraphs = [
        topic.summary,
        ...topic.mechanism,
        topic.pilot.explanation.intro,
        ...topic.pilot.explanation.steps.map((step) => step.text),
      ];
      const references = topic.pilot.code.steps.filter(
        (reference) =>
          mentions(
            reference.explanation.split("\n\nПереданный фрагмент:")[0],
          ) ||
          (name === "typescript" && /\.tsx?$/.test(reference.path)) ||
          (name === "vue" && /\.vue$/.test(reference.path)),
      );
      return { topic, paragraphs: paragraphs.filter(mentions), references };
    })
    .filter(
      (example) => example.paragraphs.length || example.references.length,
    );
  const excerpts = [
    ...new Set(examples.flatMap((example) => example.paragraphs)),
  ].slice(0, 3);
  const references = examples.flatMap((example) => example.references);
  return {
    description: [purposes[name], ...excerpts].filter(Boolean).join("\n\n"),
    topicIds: examples.map((example) => example.topic.id),
    codeReferences: references
      .filter(
        (reference, index) =>
          references.findIndex(
            (other) =>
              other.project === reference.project &&
              other.path === reference.path &&
              other.line === reference.line,
          ) === index,
      )
      .slice(0, 8),
  };
}
