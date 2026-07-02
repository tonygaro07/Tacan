// E4-01 — geometry: engine ids map to a consistent hex lattice
import { describe, expect, it } from "vitest";
import { generateBoard } from "@tacan/rules";
import { HEX_SIZE, edgeEnds, hexCorners, vertexPos } from "../src/geometry";

describe("board geometry", () => {
  const b = generateBoard(3);

  it("gives all 54 vertices distinct screen positions", () => {
    const seen = new Set(b.vertices.map((v) => vertexPos(v).map((n) => n.toFixed(3)).join(",")));
    expect(seen.size).toBe(54);
  });

  it("every edge renders at exactly one hex-side length", () => {
    for (const e of b.edges) {
      const [[x1, y1], [x2, y2]] = edgeEnds(e);
      const len = Math.hypot(x2 - x1, y2 - y1);
      expect(Math.abs(len - HEX_SIZE)).toBeLessThan(1e-6);
    }
  });

  it("tiles are hexagons whose corners coincide with their vertex positions", () => {
    for (const t of b.tiles) {
      const cornerPts = hexCorners(t.id).split(" ").map((p) => p.split(",").map(Number));
      expect(cornerPts).toHaveLength(6);
      for (const v of b.tileVertices[t.id]) {
        const [vx, vy] = vertexPos(v);
        const hit = cornerPts.some(([cx, cy]) => Math.hypot(cx - vx, cy - vy) < 1e-6);
        expect(hit).toBe(true);
      }
    }
  });
});
