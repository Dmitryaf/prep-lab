import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { projects, topics } from "#server/infrastructure/projects/owner.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositories = process.env.PROJECT_SOURCES_ROOT || resolve(root, "..");
let count = 0;
function check(base: string, path: string, label: string) {
  const absolute = resolve(base, path);
  assert(
    absolute.startsWith(resolve(base) + sep),
    `Path escapes source root: ${label}`,
  );
  assert(existsSync(absolute), `Missing ${label}: ${absolute}`);
  count++;
  return absolute;
}
for (const topic of topics) {
  for (const [path] of topic.sources)
    check(resolve(repositories, projects[topic.project].repo), path, topic.id);
  for (const [path] of topic.theory)
    check(resolve(repositories, "career-knowledge"), path, topic.id);
  if (topic.pilot) {
    for (const note of topic.pilot.study)
      check(resolve(repositories, "career-knowledge"), note.path, topic.id);
    for (const step of [...topic.pilot.code.steps, ...topic.pilot.code.tests]) {
      assert(
        step.project === "cokr" || Object.hasOwn(projects, step.project),
        `Unknown code project: ${step.project}`,
      );
      const base =
        step.project === "cokr"
          ? process.env.COKR_ROOT || resolve(repositories, "cokr")
          : resolve(repositories, projects[step.project].repo);
      const path = check(base, step.path, topic.id);
      let source = readFileSync(path, "utf8");
      const qualified = /^([A-Z]\w*)\.([a-zA-Z_]\w*)$/.exec(step.symbol);
      const symbol = qualified ? qualified[2] : step.symbol;
      const revision = topic.pilot.sourceRevision;
      if (
        !source.split(/\r?\n/)[step.line - 1]?.includes(symbol) &&
        revision &&
        /^[a-f0-9]{40}$/.test(revision)
      )
        source = execFileSync(
          "git",
          ["-C", base, "show", `${revision}:${step.path}`],
          { encoding: "utf8", maxBuffer: 5_000_000 },
        );
      const line = source.split(/\r?\n/)[step.line - 1];
      if (qualified)
        assert(
          new RegExp(`class\\s+${qualified[1]}\\b`).test(source),
          `Missing class: ${step.symbol}`,
        );
      assert(
        line?.includes(symbol),
        `Symbol/line mismatch: ${topic.id} ${step.path}:${step.line} (${step.symbol})`,
      );
    }
  }
}
console.log(
  `PASS ${count} local source/knowledge/code references. GitHub availability is not checked.`,
);
