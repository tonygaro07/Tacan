// E1-02 acceptance tests — core data models & board graph integrity
import { describe, expect, it } from "vitest";
import { generateBoard } from "../src/board.js";
import { newGame } from "./helpers.js";

describe("E1-02 board graph", () => {
  const b = generateBoard(99);

  it("has the canonical Catan geometry: 54 vertices, 72 edges", () => {
    expect(b.vertices).toHaveLength(54);
    expect(b.edges).toHaveLength(72);
  });

  it("every tile touches exactly 6 vertices; every edge exactly 2", () => {
    for (const t of b.tiles) expect(new Set(b.tileVertices[t.id]).size).toBe(6);
    for (const e of b.edges) expect(b.edgeVertices[e]).toHaveLength(2);
  });

  it("vertices touch 1–3 tiles and 2–3 edges; 30 are coastal", () => {
    let coastal = 0;
    for (const v of b.vertices) {
      const tiles = b.vertexTiles[v].length;
      expect(tiles).toBeGreaterThanOrEqual(1);
      expect(tiles).toBeLessThanOrEqual(3);
      if (tiles < 3) coastal++;
      expect(b.vertexEdges[v].length).toBeGreaterThanOrEqual(2);
      expect(b.vertexEdges[v].length).toBeLessThanOrEqual(3);
    }
    expect(coastal).toBe(30);
  });

  it("vertex adjacency is symmetric", () => {
    for (const v of b.vertices) {
      for (const n of b.vertexNeighbors[v]) {
        expect(b.vertexNeighbors[n]).toContain(v);
      }
    }
  });
});

describe("E1-02 game state models", () => {
  const g = newGame(7);

  it("creates players with full piece stocks and empty hands", () => {
    expect(g.players).toHaveLength(4);
    for (const p of g.players) {
      expect(p.piecesLeft).toEqual({ roads: 15, settlements: 5, cities: 4 });
      expect(Object.values(p.resources).every((n) => n === 0)).toBe(true);
      expect(p.devCards).toHaveLength(0);
    }
  });

  it("bank starts with 19 of each resource", () => {
    expect(g.bank).toEqual({ wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 });
  });

  it("dev deck is the standard 25: 14 knights, 2+2+2 actions, 5 VP", () => {
    expect(g.devDeck).toHaveLength(25);
    const n = (t: string) => g.devDeck.filter((c) => c === t).length;
    expect(n("knight")).toBe(14);
    expect(n("roadBuilding")).toBe(2);
    expect(n("yearOfPlenty")).toBe(2);
    expect(n("monopoly")).toBe(2);
    expect(n("victoryPoint")).toBe(5);
  });

  it("rejects player counts outside 3–6", () => {
    expect(() => newGame(1, ["a", "b"])).toThrow();
    expect(() => newGame(1, ["a", "b", "c", "d", "e", "f", "g"])).toThrow();
  });
});
