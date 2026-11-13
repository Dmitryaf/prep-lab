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
    [
      "debounce",
      "throttle",
      "draft",
      "autosave",
      "setTimeout",
      "save",
      "persist",
    ],
  ],
  [
    /reactiv|реактив|computed|watch/i,
    ["computed", "watchEffect", "watch(", "reactive", "ref("],
  ],
  [/замыкан|closure/i, ["setTimeout", "addEventListener", "useCallback"]],
];
const slotConsumerPattern =
  /(?:v-slot|<template\s+#[\w-]+)\s*(?::[^=\s]+)?\s*=/s;
const slotProviderPattern = /<slot\b[^>]*:[\w-]+/s;
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
    const matches: Array<{
      material: Material;
      score: number;
      key: string;
      slotConsumer: boolean;
      slotProvider: boolean;
    }> = [];
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
      const slotConsumer = slotExample && slotConsumerPattern.test(text);
      const scopedSlot =
        slotExample && (slotProviderPattern.test(text) || slotConsumer);
      const score =
        hits.length * 10 +
        terms.length +
        boost +
        (scopedSlot ? 30 : 0) -
        (/(?:test|spec|fixture)/i.test(path) ? 10 : 0);
      if (!slotConsumer && (aliases.length ? !hits.length : !terms.length))
        return;
      const lines = text.split(/\r?\n/);
      // State declarations can precede the behavior by hundreds of lines.
      // Select bounded windows around actual handlers and slot bindings too.
      const ranked = lines
        .map((line, index) => {
          const lowerLine = line.toLowerCase();
          const count = (hits.length ? hits : terms).filter((word) =>
            lowerLine.includes(word),
          ).length;
          const slot =
            slotExample &&
            /<slot\b|v-slot|<template\s+#[\w-]+\s*=|^\s*#[\w-]+\s*=/.test(line);
          const handler =
            count > 0 &&
            /(?:function\s|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(|watch\s*\()/i.test(
              line,
            );
          const persistence =
            count > 0 &&
            /(?:function\s+\w*(?:save|persist)\w*|(?:await\s+)?\w+\.(?:save|persist|remove)\w*\s*\()/i.test(
              line,
            );
          const method =
            count > 0 &&
            /^\s*(?:async\s+)?(?:save|persist|remove)\w*\s*\([^;]*\)\s*(?::[^={]+)?\s*\{/i.test(
              line,
            );
          return {
            index,
            score:
              count +
              (slot ? 40 : 0) +
              (handler ? 10 : 0) +
              (persistence ? 20 : 0) +
              (method ? 35 : 0),
          };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index);
      const ranges: Array<{ start: number; end: number; hit: number }> = [];
      for (const hit of ranked) {
        if (
          ranges.some(
            (range) => hit.index >= range.start && hit.index < range.end,
          )
        )
          continue;
        const start = Math.max(0, hit.index - 8);
        ranges.push({
          start,
          end: Math.min(lines.length, start + 75),
          hit: hit.index,
        });
        if (ranges.length === 3) break;
      }
      // Spend the character budget by relevance before restoring source order.
      // A long earlier window must not truncate the selected handler at the end.
      const selectedIndices = new Set<number>();
      let remaining = 14000;
      const addLine = (index: number) => {
        if (selectedIndices.has(index)) return;
        // Reserve the line separator and an omission marker for every line.
        const cost = `${startLine + index}: ${lines[index]}`.length + 3;
        if (cost > remaining) return;
        selectedIndices.add(index);
        remaining -= cost;
      };
      for (const range of ranges) {
        addLine(range.hit);
        for (let index = range.hit + 1; index < range.end; index++)
          addLine(index);
        for (let index = range.hit - 1; index >= range.start; index--)
          addLine(index);
      }
      const selectedLines = [...selectedIndices].sort((a, b) => a - b);
      const selectedSource = selectedLines
        .map((index) => lines[index])
        .join("\n");
      const first = selectedLines[0] || 0;
      const excerpt = selectedLines
        .map(
          (index, position) =>
            `${position && index > selectedLines[position - 1]! + 1 ? "…\n" : ""}${startLine + index}: ${lines[index]}`,
        )
        .join("\n");
      matches.push({
        score,
        key: project + ":" + path,
        slotConsumer: slotExample && slotConsumerPattern.test(selectedSource),
        slotProvider: slotExample && slotProviderPattern.test(selectedSource),
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
    const rankedMatches = matches
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
      .filter((match) => {
        if (seen.has(match.key)) return false;
        seen.add(match.key);
        return true;
      });
    // Keep both sides of the slot contract when available. Many providers must
    // not crowd out the consumer (or vice versa) at the six-fragment boundary.
    const preferred = slotExample
      ? [
          rankedMatches.find((match) => match.slotProvider),
          rankedMatches.find((match) => match.slotConsumer),
        ].filter((match) => match !== undefined)
      : [];
    seen.clear();
    const found = [...preferred, ...rankedMatches]
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
