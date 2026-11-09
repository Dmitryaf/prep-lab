import type { CodeStep, Topic } from "./types.ts";
import type { MapDiagram, ProjectMapNode, ProjectMapView } from "./map.ts";

export function mapRelations(
  diagram: MapDiagram,
  selected: ProjectMapNode,
  view: ProjectMapView,
  projectName: string,
) {
  const groups = new Map<
    string,
    { title: string; items: { node: ProjectMapNode; label: string }[] }
  >();
  for (const edge of diagram.edges) {
    if (edge.from !== selected.id && edge.to !== selected.id) continue;
    const outgoing = edge.from === selected.id;
    const node = diagram.nodes.find(
      (item) => item.id === (outgoing ? edge.to : edge.from),
    );
    if (!node || (node.kind === "system" && node.label === projectName))
      continue;
    const titles = {
      contains: outgoing ? "Содержит" : "Входит в",
      uses: outgoing ? "Использует" : "Используется в",
      flow:
        view === "scenarios"
          ? outgoing
            ? "Перейти дальше"
            : "Перейти из"
          : outgoing
            ? "Исходящие связи"
            : "Входящие связи",
    };
    const key = edge.kind + ":" + outgoing;
    const group = groups.get(key) || { title: titles[edge.kind], items: [] };
    if (
      !group.items.some(
        (item) => item.node.id === node.id && item.label === edge.label,
      )
    )
      group.items.push({ node, label: edge.label });
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function mapMaterials(node: ProjectMapNode, topics: Topic[]) {
  const related = topics.filter((topic) => node.topicIds.includes(topic.id));
  const references = [
    ...(node.codeReferences || []),
    ...related.flatMap((topic) => topic.pilot.code.steps),
  ];
  return {
    topics: related,
    references: references.filter(
      (ref, index) =>
        references.findIndex(
          (other) =>
            other.project === ref.project &&
            other.path === ref.path &&
            other.line === ref.line,
        ) === index,
    ) as CodeStep[],
  };
}

export function scenarioDiagram(node: ProjectMapNode): MapDiagram {
  const nodes = (node.steps || []).map((step) => ({
    ...step,
    id: node.id + "/step/" + step.id,
    kind: "scenario" as const,
  }));
  return {
    nodes,
    edges: nodes.slice(1).map((step, index) => ({
      from: nodes[index].id,
      to: step.id,
      label: "Далее",
      kind: "flow" as const,
    })),
  };
}

export function structureDiagram(
  diagram: MapDiagram,
  projectName: string,
): MapDiagram {
  const nodes = diagram.nodes.filter(
    (node) => !(node.kind === "system" && node.label === projectName),
  );
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: diagram.edges.filter(
      (edge) => ids.has(edge.from) && ids.has(edge.to),
    ),
  };
}

export function mapOverviewNodes(diagram: MapDiagram, view: ProjectMapView) {
  const kind = view === "technologies" ? "technology" : "scenario";
  return diagram.nodes.filter((node) => node.kind === kind);
}
