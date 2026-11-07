import { z } from "zod";
import type { CodeStep, Project, Topic } from "./types.ts";
import { technologyDetails } from "./technology.ts";
import { codePreviewSchema } from "./code.ts";

const referenceSchema = z.object({
  preview: codePreviewSchema.optional(),
  project: z.string(),
  path: z.string().min(1).max(2048),
  line: z.number().int().positive(),
  symbol: z.string().max(500),
  title: z.string().max(500),
  explanation: z.string().max(100000),
});
export const projectMapNodeSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  kind: z.enum(["scenario", "module", "technology", "system"]),
  description: z.string().max(6000),
  topicIds: z.array(z.string()).max(80),
  codeReferences: z.array(referenceSchema).max(40).optional(),
});
export const projectMapEdgeSchema = z.object({
  from: z.string().min(1).max(200),
  to: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  kind: z.enum(["flow", "uses", "contains"]),
});
export const projectMapSchema = z
  .object({
    nodes: z.array(projectMapNodeSchema).min(1).max(100),
    edges: z.array(projectMapEdgeSchema).max(250),
  })
  .superRefine((map, context) => {
    const ids = new Set(map.nodes.map((node) => node.id));
    if (ids.size !== map.nodes.length)
      context.addIssue({
        code: "custom",
        message: "Узлы карты должны иметь разные ID.",
      });
    for (const edge of map.edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to)
        context.addIssue({
          code: "custom",
          message: "Связь карты должна соединять два существующих узла.",
        });
    }
  });
export type ProjectMap = z.infer<typeof projectMapSchema>;
export type ProjectMapNode = z.infer<typeof projectMapNodeSchema>;
export type ProjectMapEdge = z.infer<typeof projectMapEdgeSchema>;
export type ProjectMapView = "scenarios" | "structure" | "technologies";

export interface MapDiagram {
  nodes: ProjectMapNode[];
  edges: ProjectMapEdge[];
}
const unique = <T>(values: T[]) => [...new Set(values)];

/** Legacy catalogs already own their explanations and references. Use those
 * relationships directly; a file sequence is not treated as a runtime call graph. */
export function projectMapDiagram(
  project: Project & { map?: ProjectMap },
  allTopics: Topic[],
  view: ProjectMapView,
): MapDiagram {
  const topics = allTopics.filter((topic) => topic.project === project.id);
  let root: ProjectMapNode = {
    id: "project:" + project.id,
    label: project.name,
    kind: "system",
    description: project.pitch || project.subtitle,
    topicIds: [],
  };
  const authored =
    view === "structure" ? project.structure || project.map : project.map;
  while (authored?.nodes.some((node) => node.id === root.id))
    root.id += ":root";
  if (authored) {
    const source = authored;
    root =
      source.nodes.find(
        (node) => node.kind === "system" && node.label === project.name,
      ) || root;
    // Include immediate relationships so technology use and scenario boundaries
    // remain visible without expanding every view into the complete graph.
    const focusKind =
      view === "scenarios"
        ? "scenario"
        : view === "structure"
          ? "module"
          : "technology";
    const focused = new Set(
      source.nodes
        .filter((node) => node.kind === focusKind)
        .map((node) => node.id),
    );
    const visible = new Set([...focused, root.id]);
    for (const edge of source.edges)
      if (
        (focused.has(edge.from) || focused.has(edge.to)) &&
        (view !== "structure" ||
          source.nodes
            .filter((node) => node.id === edge.from || node.id === edge.to)
            .every((node) => node.kind === "module" || node.kind === "system"))
      ) {
        visible.add(edge.from);
        visible.add(edge.to);
      }
    const nodes = source.nodes.filter(
      (node) => visible.has(node.id) && node.id !== root.id,
    );
    const edges = source.edges.filter(
      (edge) => visible.has(edge.from) && visible.has(edge.to),
    );
    const incoming = new Set(edges.map((edge) => edge.to));
    const roots = nodes.filter((node) => !incoming.has(node.id));
    return {
      nodes: [root, ...nodes].map((node) =>
        view === "structure"
          ? {
              ...node,
              codeReferences: mapCodeReferences(
                topics.filter((topic) => node.topicIds.includes(topic.id)),
                node.codeReferences,
              ),
            }
          : node,
      ),
      edges: [
        ...edges,
        ...(roots.length
          ? roots
          : edges.some((edge) => edge.from === root.id)
            ? []
            : nodes.slice(0, 1)
        ).map((node) => ({
          from: root.id,
          to: node.id,
          label: "Часть проекта",
          kind: "contains" as const,
        })),
      ],
    };
  }
  const nodes = [root],
    edges: ProjectMapEdge[] = [];
  const connect = (
    from: string,
    to: string,
    label: string,
    kind: ProjectMapEdge["kind"] = "contains",
  ) => edges.push({ from, to, label, kind });
  if (view === "technologies") {
    for (const technology of unique(
      project.stack.filter((value) => value.trim()),
    )) {
      const id = "technology:" + technology;
      nodes.push({
        id,
        label: technology,
        kind: "technology",
        ...technologyDetails(technology, topics),
      });
      connect(root.id, id, "Используется в проекте", "uses");
    }
  } else if (view === "scenarios") {
    for (const group of unique(topics.map((topic) => topic.group))) {
      const groupId = "group:" + group;
      nodes.push({
        id: groupId,
        label: group,
        kind: "module",
        description: "",
        topicIds: [],
      });
      connect(root.id, groupId, "Раздел");
      for (const topic of topics.filter((item) => item.group === group)) {
        const id = "topic:" + topic.id;
        nodes.push({
          id,
          label: topic.title,
          kind: "scenario",
          description: topic.summary,
          topicIds: [topic.id],
        });
        connect(groupId, id, "Тема");
      }
    }
  } else {
    for (const group of unique(topics.map((topic) => topic.group))) {
      const members = topics.filter((topic) => topic.group === group);
      const id = "module:" + group;
      nodes.push({
        id,
        label: group,
        kind: "module",
        description: members
          .map((topic) => `**${topic.title}**\n\n${topic.summary}`)
          .join("\n\n"),
        topicIds: members.map((topic) => topic.id),
        codeReferences: mapCodeReferences(members),
      });
      connect(root.id, id, "Часть системы");
    }
  }
  return { nodes, edges };
}

function mapCodeReferences(topics: Topic[], own: CodeStep[] = []) {
  const references = [
    ...own,
    ...topics.flatMap((topic) => topic.pilot.code.steps),
  ];
  return references.filter(
    (reference, index) =>
      references.findIndex(
        (other) =>
          other.project === reference.project &&
          other.path === reference.path &&
          other.line === reference.line,
      ) === index,
  );
}

export function layoutProjectMap(diagram: MapDiagram, compact = false) {
  const depths = new Map<string, number>();
  const root = diagram.nodes[0];
  if (!root) return { nodes: [], edges: [], width: 320, height: 160 };
  depths.set(root.id, 0);
  const queue = [root.id];
  for (let index = 0; index < queue.length; index++)
    for (const edge of diagram.edges.filter(
      (item) => item.from === queue[index],
    ))
      if (!depths.has(edge.to)) {
        depths.set(edge.to, depths.get(edge.from)! + 1);
        queue.push(edge.to);
      }
  const columns = new Map<number, ProjectMapNode[]>();
  for (const node of diagram.nodes) {
    const depth = depths.get(node.id) ?? 1;
    columns.set(depth, [...(columns.get(depth) || []), node]);
  }
  const rows = Math.max(
    ...[...columns.values()].map((column) => column.length),
  );
  const height = compact
    ? 140 + Math.ceil((diagram.nodes.length - 1) / 2) * 104
    : Math.max(200, rows * 112 + 48);
  const nodes = compact
    ? diagram.nodes.map((node, index) => ({
        ...node,
        x: index === 0 ? 169 : 24 + ((index - 1) % 2) * 290,
        y: index === 0 ? 24 : 140 + Math.floor((index - 1) / 2) * 104,
      }))
    : [...columns].flatMap(([depth, column]) =>
        column.map((node, index) => ({
          ...node,
          x: 24 + depth * 290,
          y: 24 + index * 112,
        })),
      );
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let routed = 0;
  const edges = diagram.edges.map((edge) => {
    const from = byId.get(edge.from)!,
      to = byId.get(edge.to)!;
    if (compact) {
      const startX =
        from.id === root.id ? 279 : from.x === 24 ? from.x + 220 : from.x;
      const endX = to.id === root.id ? 279 : to.x === 24 ? to.x + 220 : to.x;
      const startY = from.y + (from.id === root.id ? 84 : 42);
      const endY = to.y + (to.id === root.id ? 84 : 42);
      return {
        ...edge,
        path:
          from.id === root.id
            ? `M ${startX} ${startY} V ${endY} H ${endX}`
            : to.id === root.id
              ? `M ${startX} ${startY} H 279 V ${endY}`
              : `M ${startX} ${startY} H 279 V ${endY} H ${endX}`,
      };
    }
    const y1 = from.y + 42,
      y2 = to.y + 42;
    if (to.x - from.x === 290) {
      const start = from.x + 220,
        end = to.x,
        middle = (start + end) / 2;
      return {
        ...edge,
        path: `M ${start} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${end} ${y2}`,
      };
    }
    // Return and long-distance links use the gaps beside cards and a lane below the diagram.
    const lane = height + routed++ * 14;
    const start = from.x + 220,
      end = to.x;
    return {
      ...edge,
      path: `M ${start} ${y1} H ${start + 20} V ${lane} H ${end - 20} V ${y2} H ${end}`,
    };
  });
  return {
    nodes,
    edges,
    width: compact ? 560 : (Math.max(...columns.keys()) + 1) * 290,
    height: height + (routed ? (routed - 1) * 14 + 24 : 0),
  };
}
