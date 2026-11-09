import type { MapDiagram } from "./map.ts";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api.js";

export interface MapPoint {
  x: number;
  y: number;
}
export const mapNodeSize = { width: 220, height: 84 };
export interface GraphLayout {
  nodes: (MapDiagram["nodes"][number] & MapPoint)[];
  edges: (MapDiagram["edges"][number] & {
    path: string;
    arrow: string;
    points: MapPoint[];
  })[];
  width: number;
  height: number;
}

export function connectionArrow(points: MapPoint[]) {
  const tip = points.at(-1)!,
    previous = points.at(-2)!;
  // ELK can leave machine-precision drift on the constant axis. Use the
  // dominant axis so a vertical edge cannot acquire a diagonal arrowhead.
  const vx = tip.x - previous.x,
    vy = tip.y - previous.y;
  const horizontal = Math.abs(vx) > Math.abs(vy);
  const dx = horizontal ? Math.sign(vx) : 0,
    dy = horizontal ? 0 : Math.sign(vy);
  const x = tip.x - dx * 8,
    y = tip.y - dy * 8;
  return `M ${tip.x} ${tip.y} L ${x - dy * 4} ${y + dx * 4} L ${x + dy * 4} ${y - dx * 4} Z`;
}

export async function layoutGraph(
  diagram: MapDiagram,
  direction: "RIGHT" | "DOWN" = "RIGHT",
): Promise<GraphLayout> {
  if (!diagram.nodes.length)
    return { nodes: [], edges: [], width: 320, height: 160 };
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const children: ElkNode[] = diagram.nodes.map((node) => ({
    id: node.id,
    ...mapNodeSize,
  }));
  const edges: ElkExtendedEdge[] = diagram.edges.map((edge, index) => ({
    id: "edge-" + index,
    sources: [edge.from],
    targets: [edge.to],
  }));
  const result = await new ELK().layout<ElkNode>({
    id: "map",
    children,
    edges,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=32,left=32,bottom=32,right=32]",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.spacing.edgeEdge": "16",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
  });
  return {
    nodes: diagram.nodes.map((node) => {
      const placed = result.children!.find((item) => item.id === node.id)!;
      return { ...node, x: placed.x!, y: placed.y! };
    }),
    edges: diagram.edges.map((edge, index) => {
      const section = result.edges!.find((item) => item.id === "edge-" + index)!
        .sections![0];
      const points = [
        section.startPoint,
        ...(section.bendPoints || []),
        section.endPoint,
      ];
      return {
        ...edge,
        points,
        path: points
          .map((point, i) => `${i ? "L" : "M"} ${point.x} ${point.y}`)
          .join(" "),
        arrow: edge.kind === "contains" ? "" : connectionArrow(points),
      };
    }),
    width: result.width!,
    height: result.height!,
  };
}
