import { basename } from "node:path";
import type { ProjectCatalog } from "#domain/projects/catalog.ts";
import type { AnalysisRecord } from "#domain/analysis/contracts.ts";
import type { PromptInput } from "#domain/prompts/contracts.ts";
import { codePresentation } from "#domain/projects/code.ts";
import { searchProjectFiles } from "#server/infrastructure/projects/search.ts";

type Material = PromptInput["materials"][number];
interface Dependencies {
  catalog: () => ProjectCatalog;
  roots: () => Array<{ id: string; name: string; path: string }>;
  analyses: () => AnalysisRecord[];
}
const stopWords = new Set(
  "project example related code scoped explain show how what with from this that then return const function import export string number boolean undefined props prop slot question title prompt answer context message материал вопрос пример проект проекта связанном связанных покажи объясни работает работает ли как что чем это для или при его она они который функции компонент компонента данных данные".split(
    " ",
  ),
);
const concepts: Array<[RegExp, string[]]> = [
  [
    /scoped.?slot|слот|\bslots?\b/i,
    ["v-slot", "<slot", "$slots", "scopedSlots", "defineSlots"],
  ],
  [
    /debounce|throttle|автосохран|черновик|draft/i,
    ["debounce", "throttle", "draft", "autosave", "setTimeout"],
  ],
  [
    /reactiv|реактив|computed|watch/i,
    ["computed", "watchEffect", "watch(", "reactive", "ref("],
  ],
  [/замыкан|closure/i, ["setTimeout", "addEventListener", "useCallback"]],
];
function requestContext(raw: string) {
  try {
    const value = JSON.parse(raw);
    const question = value.question || value;
    return {
      title: [
        value.title,
        value.mainQuestion?.title,
        question.title,
        value.followup,
      ]
        .filter((text) => typeof text === "string")
        .join(" "),
      project:
        typeof question.project === "string"
          ? question.project
          : typeof value.mainQuestion?.project === "string"
            ? value.mainQuestion.project
            : "",
      topic: typeof question.topicId === "string" ? question.topicId : "",
    };
  } catch {
    return { title: raw.slice(0, 2000), project: "", topic: "" };
  }
}

/** Search is deterministic and read-only, so preview and send share the same task. */
export function projectDiscussionContext(dependencies: Dependencies) {
  return async (context: string, message: string): Promise<Material[]> => {
    const current = requestContext(context);
    if (
      !current.project &&
      !/проект|исходник|репозит|мо[йиём]+\s+код|project|repository/i.test(
        message,
      )
    )
      return [];
    const catalog = dependencies.catalog();
    const query = current.title + " " + message;
    const slotExample = concepts[0]![0].test(query);
    const aliases = concepts
      .filter(([pattern]) => pattern.test(query))
      .flatMap(([, words]) => words.map((word) => word.toLowerCase()));
    const words = [
      ...new Set(
        (
          query.toLowerCase().match(/[\p{L}_$][\p{L}\p{N}_$-]{2,}/gu) || []
        ).filter((word) => !stopWords.has(word)),
      ),
    ].slice(0, 35);
    const projects = Object.values(catalog.projects);
    const named = projects.filter((project) =>
      [project.id, project.name, project.repo].some(
        (name) =>
          name.length > 2 && message.toLowerCase().includes(name.toLowerCase()),
      ),
    );
    const selected = new Set(
      named.length
        ? named.map((project) => project.id)
        : current.project
          ? [current.project]
          : [],
    );
    const matches: Array<{ material: Material; score: number; key: string }> =
      [];
    const statuses: Array<{ source: string; status: string }> = [];
    function consider(
      project: string,
      path: string,
      text: string,
      origin: string,
      startLine = 1,
      boost = 0,
    ) {
      if (selected.size && !selected.has(project)) return;
      if (slotExample && !/\.vue$/i.test(path)) return;
      const lower = text.toLowerCase();
      const hits = aliases.filter((word) => lower.includes(word));
      const terms = words.filter((word) => lower.includes(word));
      const scopedSlot =
        slotExample &&
        /<slot\b[^>]*:[\w-]+|v-slot|<template\s+#\w+\s*=/s.test(text);
      const score =
        hits.length * 10 +
        terms.length +
        boost +
        (scopedSlot ? 30 : 0) -
        (/(?:test|spec|fixture)/i.test(path) ? 10 : 0);
      if (aliases.length ? !hits.length : !terms.length) return;
      const lines = text.split(/\r?\n/);
      const first = Math.max(
        0,
        lines.findIndex((line) =>
          (hits.length ? hits : terms).some((word) =>
            line.toLowerCase().includes(word),
          ),
        ) - 8,
      );
      const excerpt = lines
        .slice(first, first + 90)
        .map((line, index) => `${startLine + first + index}: ${line}`)
        .join("\n")
        .slice(0, 10000);
      matches.push({
        score,
        key: project + ":" + path,
        material: {
          id: `project-code:${project}:${path}`.slice(0, 2048),
          path: `${project}/${path}:${startLine + first}`.slice(0, 1024),
          text: `Проект: ${catalog.projects[project]?.name || project}\nИсточник: ${origin}\n\n${excerpt}`,
        },
      });
    }
    for (const topic of catalog.topics) {
      for (const step of [
        ...topic.pilot.code.steps,
        ...topic.pilot.code.tests,
      ]) {
        const preview = codePresentation(step).preview;
        if (preview)
          consider(
            topic.project,
            step.path,
            preview.text,
            `сохранённый фрагмент${preview.revision ? ", версия " + preview.revision : ""}`,
            preview.startLine,
            topic.id === current.topic ? 2 : 0,
          );
      }
    }
    for (const record of dependencies.analyses()) {
      if (
        record.job.status !== "accepted" ||
        record.job.scenario !== "project" ||
        !record.job.projectId ||
        !catalog.projects[record.job.projectId]
      )
        continue;
      for (const material of record.materials)
        consider(
          record.job.projectId,
          material.path,
          material.text,
          "принятый снимок проекта",
        );
    }
    const roots = dependencies
      .roots()
      .filter((root) => {
        const project = projects.find(
          (item) =>
            [item.id, item.repo].includes(root.id) ||
            item.repo === basename(root.path),
        );
        return project && (!selected.size || selected.has(project.id));
      })
      .slice(0, 8);
    for (const root of roots) {
      const project = projects.find(
        (item) =>
          [item.id, item.repo].includes(root.id) ||
          item.repo === basename(root.path),
      )!;
      // Discard a root's partial results if reading fails or its identity changes.
      const candidates: Parameters<typeof consider>[] = [];
      try {
        const result = await searchProjectFiles(
          root.path,
          (file) =>
            candidates.push([
              project.id,
              file.path,
              file.text,
              "исходный файл подключённой папки",
              1,
              1,
            ]),
          (path) => !slotExample || /\.vue$/i.test(path),
        );
        // A current file supersedes its saved excerpt, even when the old pattern
        // has disappeared. Do not explain removed code as the current project.
        const currentPaths = new Set(
          candidates.map(([id, path]) => id + ":" + path),
        );
        for (let index = matches.length - 1; index >= 0; index--) {
          if (currentPaths.has(matches[index]!.key)) matches.splice(index, 1);
        }
        for (const candidate of candidates) consider(...candidate);
        statuses.push({
          source: root.name,
          status: result.limited
            ? "Поиск ограничен размером; показаны найденные фрагменты."
            : "Поиск выполнен.",
        });
      } catch {
        statuses.push({
          source: root.name,
          status:
            "Папка недоступна для безопасного чтения; использованы доступные сохранённые фрагменты.",
        });
      }
    }
    const seen = new Set<string>();
    const found = matches
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
      .filter((match) => {
        if (seen.has(match.key)) return false;
        seen.add(match.key);
        return true;
      })
      .slice(0, 6)
      .map((match) => match.material);
    return [
      ...found,
      {
        id: "project-search",
        path: "Результат поиска по подключённым проектам",
        text: JSON.stringify({
          fragments: found.length,
          sources: statuses,
          result: found.length
            ? "Подходящие фрагменты найдены. Используй их для ответа с путём и строками."
            : "Подходящий фрагмент в доступных проектах не найден. Не приписывай им пример.",
        }),
      },
    ];
  };
}
