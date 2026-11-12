import type { Knowledge } from "#domain/knowledge/material.ts";
import type { ProjectCatalog } from "#domain/projects/catalog.ts";
import type { CodeStep } from "#domain/projects/types.ts";
import { projectMapDiagram, type MapDiagram } from "#domain/projects/map.ts";
import type { IntensiveLesson } from "./contracts.ts";

export interface IntensiveContext {
  code: CodeStep[];
  map: MapDiagram;
  materials: { id: string; title: string; markdown: string; why: string }[];
  projectName?: string;
  pitch?: string;
}

export function intensiveContext(
  lesson: IntensiveLesson,
  knowledge: Knowledge,
  catalog: ProjectCatalog,
): IntensiveContext {
  const project = lesson.projectId
    ? catalog.projects[lesson.projectId]
    : undefined;
  const topic = catalog.topics.find(
    (item) => item.id === lesson.topicId && item.project === lesson.projectId,
  );
  const references = [
    ...(topic?.pilot.study || []).map((item) => ({
      id: item.path.replace(/\.md$/, ""),
      why: item.why,
    })),
    ...lesson.questions
      .flatMap((question) => question.learningLinks || [])
      .filter((link) => link.kind === "theory")
      .map((link) => ({ id: link.noteId, why: "" })),
  ];
  const materials: IntensiveContext["materials"] = [];
  for (const reference of references) {
    const note = knowledge.notes.find(
      (item) =>
        item.id === reference.id ||
        item.path.replace(/\.md$/, "") === reference.id,
    );
    if (note && !materials.some((item) => item.id === note.id))
      materials.push({
        id: note.id,
        title: note.title,
        markdown: note.markdown,
        why: reference.why,
      });
  }
  const diagram = project
    ? projectMapDiagram(project, catalog.topics, "scenarios")
    : { nodes: [], edges: [] };
  const selected = new Set(
    diagram.nodes
      .filter(
        (node) =>
          node.topicIds.includes(lesson.topicId || "") ||
          node.steps?.some((step) =>
            step.topicIds.includes(lesson.topicId || ""),
          ),
      )
      .map((node) => node.id),
  );
  const edges = diagram.edges.filter(
    (edge) => selected.has(edge.from) || selected.has(edge.to),
  );
  const nodeIds = new Set([
    ...selected,
    ...edges.flatMap((edge) => [edge.from, edge.to]),
  ]);
  return {
    code: topic?.pilot.code.steps || [],
    map: { nodes: diagram.nodes.filter((node) => nodeIds.has(node.id)), edges },
    materials,
    ...(project ? { projectName: project.name, pitch: project.pitch } : {}),
  };
}
