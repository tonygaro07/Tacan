// E1-01 acceptance tests — board generator
import { describe, expect, it } from "vitest";
import { generateBoard } from "../src/board.js";

describe("E1-01 board generator", () => {
  const board = generateBoard(1234);

  it("has exactly 19 tiles with the standard resource distribution", () => {
    expect(board.tiles).toHaveLength(19);
    const count = (res: string) => board.tiles.filter((t) => t.resource === res).length;
    expect(count("wood")).toBe(4);
    expect(count("brick")).toBe(3);
    expect(count("sheep")).toBe(4);
    expect(count("wheat")).toBe(4);
    expect(count("ore")).toBe(3);
    expect(count("desert")).toBe(1);
  });

  it("places the standard 18 number tokens on non-desert tiles only", () => {
    const tokens = board.tiles.filter((t) => t.resource !== "desert").map((t) => t.token);
    expect(tokens).toHaveLength(18);
    expect(tokens.every((t) => t !== null && t >= 2 && t <= 12 && t !== 7)).toBe(true);
    const sorted = [...(tokens as number[])].sort((a, b) => a - b);
    expect(sorted).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    const desert = board.tiles.find((t) => t.resource === "desert")!;
    expect(desert.token).toBeNull();
  });

  it("starts the robber on the desert", () => {
    const desert = board.tiles.find((t) => t.resource === "desert")!;
    expect(board.robberTile).toBe(desert.id);
  });

  it("never puts 6 and 8 tokens on adjacent tiles (across many seeds)", () => {
    for (let seed = 0; seed < 25; seed++) {
      const b = generateBoard(seed);
      const reds = b.tiles.filter((t) => t.token === 6 || t.token === 8);
      for (const a of reds) {
        for (const c of reds) {
          if (a.id === c.id) continue;
          const dist = Math.max(
            Math.abs(a.q - c.q),
            Math.abs(a.r - c.r),
            Math.abs(a.q + a.r - c.q - c.r),
          );
          expect(dist).toBeGreaterThan(1);
        }
      }
    }
  });

  it("creates 9 ports: 4 generic + 1 of each resource, on 18 distinct coastal vertices", () => {
    expect(board.ports).toHaveLength(9);
    const types = board.ports.map((p) => p.type);
    expect(types.filter((t) => t === "generic")).toHaveLength(4);
    for (const res of ["wood", "brick", "sheep", "wheat", "ore"]) {
      expect(types.filter((t) => t === res)).toHaveLength(1);
    }
    const portVerts = board.ports.flatMap((p) => p.vertices);
    expect(new Set(portVerts).size).toBe(18);
    // every port vertex is coastal (touches < 3 board tiles)
    for (const v of portVerts) expect(board.vertexTiles[v].length).toBeLessThan(3);
  });

  it("is deterministic per seed and different across seeds", () => {
    const a = generateBoard(7);
    const b = generateBoard(7);
    const c = generateBoard(8);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.ports).toEqual(b.ports);
    expect(JSON.stringify(a.tiles)).not.toEqual(JSON.stringify(c.tiles));
  });
});
