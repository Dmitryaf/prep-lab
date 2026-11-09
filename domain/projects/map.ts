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
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        label: z.string().min(1).max(200),
        description: z.string().max(4000),
        topicIds: z.array(z.string()).max(80),
      }),
    )
    .min(2)
    .max(12)
    .optional(),
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
    for (const node of map.nodes) {
      if (
        node.steps &&
        (node.kind !== "scenario" ||
          new Set(node.steps.map((step) => step.id)).size !== node.steps.length)
      )
        context.addIssue({
          code: "custom",
          message:
            "Шаги сценария должны иметь разные ID и принадлежать сценарию.",
        });
    }
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
  type Point = { x: number; y: number };
  const branch = (edge: ProjectMapEdge) => edge.from === root.id;
  // Root branches share a port and trunk. Other relationships get distinct
  // ports, so several arrows cannot cover one another at the same card edge.
  const portY = (node: (typeof nodes)[number], edge: ProjectMapEdge) => {
    if (branch(edge)) return node.y + 42;
    const links = diagram.edges.filter(
      (item) => !branch(item) && (item.from === node.id || item.to === node.id),
    );
    const index = links.indexOf(edge);
    const spacing = Math.min(12, 48 / Math.max(1, links.length - 1));
    return node.y + 42 + (index - (links.length - 1) / 2) * spacing;
  };
  const connection = (edge: ProjectMapEdge, input: Point[]) => {
    const points = input
      .map(({ x, y }) => ({
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
      }))
      .filter(
        (point, index, all) =>
          !index ||
          point.x !== all[index - 1].x ||
          point.y !== all[index - 1].y,
      );
    const tip = points.at(-1)!,
      previous = points.at(-2)!;
    const dx = Math.sign(tip.x - previous.x),
      dy = Math.sign(tip.y - previous.y);
    const base = { x: tip.x - dx * 8, y: tip.y - dy * 8 };
    return {
      ...edge,
      points,
      path: points
        .map((point, index) =>
          index === 0
            ? `M ${point.x} ${point.y}`
            : point.x === points[index - 1].x
              ? `V ${point.y}`
              : `H ${point.x}`,
        )
        .join(" "),
      // Explicit geometry keeps the tip on the path endpoint at any zoom and
      // stroke width. An SVG marker has its own viewport and scaling rules.
      arrow: `M ${tip.x} ${tip.y} L ${base.x - dy * 4} ${base.y + dx * 4} L ${base.x + dy * 4} ${base.y - dx * 4} Z`,
    };
  };
  let routed = 0;
  let sideLane = 0;
  let width = compact ? 560 : (Math.max(...columns.keys()) + 1) * 290;
  const edges = diagram.edges.map((edge, index) => {
    const from = byId.get(edge.from)!,
      to = byId.get(edge.to)!;
    if (compact) {
      const startX =
        from.id === root.id ? 279 : from.x === 24 ? from.x + 220 : from.x;
      const endX = to.id === root.id ? 279 : to.x === 24 ? to.x + 220 : to.x;
      const startY = from.id === root.id ? from.y + 84 : portY(from, edge);
      const endY = to.id === root.id ? to.y + 84 : portY(to, edge);
      const lane = 279 + [0, -6, 6, -12, 12][index % 5];
      return connection(
        edge,
        from.id === root.id
          ? [
              { x: startX, y: startY },
              { x: startX, y: endY },
              { x: endX, y: endY },
            ]
          : to.id === root.id
            ? [
                { x: startX, y: startY },
                { x: endX, y: startY },
                { x: endX, y: endY },
              ]
            : [
                { x: startX, y: startY },
                { x: lane, y: startY },
                { x: lane, y: endY },
                { x: endX, y: endY },
              ],
      );
    }
    const y1 = portY(from, edge),
      y2 = portY(to, edge);
    if (to.x - from.x === 290) {
      const start = from.x + 220,
        end = to.x,
        middle = (start + end) / 2;
      return connection(edge, [
        { x: start, y: y1 },
        { x: middle, y: y1 },
        { x: middle, y: y2 },
        { x: end, y: y2 },
      ]);
    }
    if (from.x === to.x) {
      // Sibling links use the outside corridor and enter from the right. They
      // never travel through the entire canvas below unrelated cards.
      const end = to.x + 220,
        lane = end + 22 + sideLane++ * 12;
      width = Math.max(width, lane + 24);
      return connection(edge, [
        { x: from.x + 220, y: y1 },
        { x: lane, y: y1 },
        { x: lane, y: y2 },
        { x: end, y: y2 },
      ]);
    }
    // Return and long-distance links use the gaps beside cards and a lane below the diagram.
    const lane = height + routed++ * 14;
    const start = from.x + 220,
      end = to.x;
    return connection(edge, [
      { x: start, y: y1 },
      { x: start + 20, y: y1 },
      { x: start + 20, y: lane },
      { x: end - 20, y: lane },
      { x: end - 20, y: y2 },
      { x: end, y: y2 },
    ]);
  });
  return {
    nodes,
    edges,
    width,
    height: height + (routed ? (routed - 1) * 14 + 24 : 0),
  };
}
