import type { Knowledge } from "#domain/knowledge/material.ts";
import type { Topic } from "#domain/projects/types.ts";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { headings } from "./knowledge.ts";
import { loadPrivateKnowledge } from "#server/infrastructure/knowledge/private.ts";
import { topics } from "#server/infrastructure/projects/owner.ts";
import { projectQuestions } from "#ui/entities/project/model/questions.ts";
import { loadCommonKnowledge } from "#server/infrastructure/knowledge/common.ts";
import { ownerCatalog } from "#server/infrastructure/projects/owner.ts";
import { ownerPackagePath } from "#server/infrastructure/projects/catalog.ts";
import type { ProjectCatalog } from "#domain/projects/catalog.ts";

interface ValidationBank {
  notes: Pick<Knowledge["notes"][number], "id" | "markdown" | "category">[];
  questions: {
    id: string;
    learningLinks?: { kind: string; noteId: string; heading: string }[];
  }[];
  route: string[];
  warnings: string[];
}
export function validateKnowledge(
  bank: ValidationBank,
  topicList: Topic[],
  catalog: Pick<ProjectCatalog, "projects" | "experience"> = {
    projects: {},
    experience: {},
  },
) {
  const notes = new Map(bank.notes.map((n) => [n.id, n]));
  const problems = [...bank.warnings];
  let count = 0;
  const check = (path: string, heading: string = "", label: string = path) => {
    const id = path.replace(/\.md$/, "");
    const note = notes.get(id);
    count++;
    if (!note) problems.push(`Missing exact knowledge path: ${label} → ${id}`);
    else if (
      heading &&
      !headings(note.markdown).some((h) =>
        [h.title, [...h.parents.slice(1), h.title].join("#")].includes(heading),
      )
    )
      problems.push(`Missing heading: ${id}#${heading}`);
  };
  for (const t of topicList) {
    for (const [p] of t.theory || []) check(p, "", t.id);
    for (const n of t.pilot?.study || []) check(n.path, "", t.id);
    if (catalog.experience[t.project]?.kind === "commercial")
      for (const [p] of t.sources || []) check(p, "", t.id);
  }
  for (const q of [
    ...bank.questions,
    ...projectQuestions(topicList, catalog.projects, catalog.experience),
  ])
    for (const l of q.learningLinks || []) check(l.noteId, l.heading, q.id);
  for (const id of bank.route) {
    const q = bank.questions.find((q) => q.id === id);
    if (!q?.learningLinks?.some((l) => l.kind === "theory"))
      problems.push(`Core question has no study link: ${id}`);
  }
  for (const n of bank.notes) {
    const section = /^Фронтенд\/(JavaScript|TypeScript)\//.exec(n.id)?.[1];
    if (section && n.category !== section)
      problems.push(`Wrong category: ${n.id} → ${n.category}`);
    if (/^Фронтенд\/(Javascript|Typescript)\//.test(n.id))
      problems.push(`Noncanonical directory: ${n.id}`);
  }
  return { problems, count };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const common = validateKnowledge(loadCommonKnowledge(), []);
  assert.deepEqual(common.problems, []);
  if (topics.length) {
    const owner = validateKnowledge(
      loadPrivateKnowledge(resolve(ownerPackagePath(), "knowledge")),
      topics,
      ownerCatalog,
    );
    assert.deepEqual(owner.problems, []);
    console.log(`PASS ${owner.count} private-package study links`);
  }
  const root = process.env.CAREER_KNOWLEDGE_ROOT;
  // Catch case-only changes that Windows accepts but a fresh checkout cannot reproduce.
  const paths = root
    ? execFileSync("git", ["-C", root, "ls-files", "-z"], {
        encoding: "utf8",
      }).split("\0")
    : [];
  assert(
    !paths.some((p) => /^Фронтенд\/(Javascript|Typescript)\//.test(p)),
    "Git index retains noncanonical directory case",
  );
  if (root)
    assert.deepEqual(
      validateKnowledge(loadPrivateKnowledge(root), []).problems,
      [],
    );
  console.log(
    `PASS ${common.count} common study links, core coverage and categories; explicit external roots also check Git path casing`,
  );
}
