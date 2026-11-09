import test from "node:test";
import assert from "node:assert/strict";
import { layoutGraph, connectionArrow } from "#domain/projects/graph-layout.ts";

test("arrow direction ignores tiny floating-point drift on a vertical edge", () => {
  const arrow = connectionArrow([
    { x: 100.00000000000003, y: 40 },
    { x: 100, y: 100 },
  ]);
  const points = arrow.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  assert.equal((points[2] + points[4]) / 2, 100);
  assert.equal((points[3] + points[5]) / 2, 92);
});

test("ELK routes a connected scenario around cards and anchors arrows on the border", async () => {
  const nodes = Array.from({ length: 7 }, (_, i) => ({
    id: "node" + i,
    label: "Блок " + i,
    kind: "module" as const,
    description: "",
    topicIds: [],
  }));
  const diagram = {
    nodes,
    edges: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 2],
      [5, 6],
    ].map(([from, to]) => ({
      from: "node" + from,
      to: "node" + to,
      kind: "flow" as const,
      label: "Передаёт",
    })),
  };
  const first = await layoutGraph(diagram),
    second = await layoutGraph(diagram);
  assert.deepEqual(first, second);
  for (const edge of first.edges) {
    const target = first.nodes.find((n) => n.id === edge.to)!,
      tip = edge.points.at(-1)!;
    assert(
      Math.abs(tip.x - target.x) < 0.1 ||
        Math.abs(tip.x - target.x - 220) < 0.1 ||
        Math.abs(tip.y - target.y) < 0.1 ||
        Math.abs(tip.y - target.y - 84) < 0.1,
    );
    assert(edge.arrow.startsWith(`M ${tip.x} ${tip.y} `));
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1],
        b = edge.points[i];
      assert(a.x === b.x || a.y === b.y);
      for (const node of first.nodes.filter(
        (n) => n.id !== edge.from && n.id !== edge.to,
      )) {
        const crosses =
          a.x === b.x
            ? a.x > node.x &&
              a.x < node.x + 220 &&
              Math.max(a.y, b.y) > node.y &&
              Math.min(a.y, b.y) < node.y + 84
            : a.y > node.y &&
              a.y < node.y + 84 &&
              Math.max(a.x, b.x) > node.x &&
              Math.min(a.x, b.x) < node.x + 220;
        assert(!crosses, `${edge.from} → ${edge.to} crosses ${node.id}`);
      }
    }
  }
});
