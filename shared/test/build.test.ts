// E1-06 acceptance tests — build costs, distance rule, connectivity, piece limits
import { describe, expect, it } from "vitest";
import { GameState, RulesError } from "../src/index.js";
import { act, autoSetup, clearHands, give, newGame, spotFree } from "./helpers.js";

/** Ask the engine itself: first empty edge it accepts a road on. */
function buildAnyRoad(g: GameState, p: number): GameState {
  for (const e of g.board.edges) {
    if (g.roadOwner[e] !== undefined) continue;
    try {
      return act(g, p, { type: "buildRoad", edge: e });
    } catch (err) {
      if (err instanceof RulesError) continue;
      throw err;
    }
  }
  throw new Error("no legal road found");
}

function buildAnySettlement(g: GameState, p: number): GameState {
  for (const v of g.board.vertices) {
    try {
      return act(g, p, { type: "buildSettlement", vertex: v });
    } catch (err) {
      if (err instanceof RulesError) continue;
      throw err;
    }
  }
  throw new Error("no legal settlement spot found");
}

function toMain(seed = 21): GameState {
  const g = autoSetup(newGame(seed));
  const main = act(g, 0, { type: "roll", forced: [2, 3] });
  clearHands(main); // exact-count assertions need known hands
  return main;
}

describe("E1-06 roads", () => {
  it("charges 1 wood + 1 brick and requires connectivity", () => {
    let g = toMain();
    give(g, 0, { wood: 1, brick: 1 });
    const before = { ...g.players[0].resources };

    // an edge in the middle of nowhere is rejected before cost matters
    const disconnected = g.board.edges.find(
      (e) =>
        g.roadOwner[e] === undefined &&
        g.board.edgeVertices[e].every(
          (v) => !g.buildings[v] && g.board.vertexEdges[v].every((x) => g.roadOwner[x] === undefined),
        ),
    )!;
    expect(() => act(g, 0, { type: "buildRoad", edge: disconnected })).toThrow(/connect/);

    g = buildAnyRoad(g, 0);
    expect(g.players[0].roads).toHaveLength(3);
    expect(g.players[0].piecesLeft.roads).toBe(12);
    expect(g.players[0].resources.wood).toBe(before.wood - 1);
    expect(g.players[0].resources.brick).toBe(before.brick - 1);
  });

  it("rejects unaffordable and occupied edges", () => {
    const g = toMain();
    const ownRoad = g.players[0].roads[0];
    expect(() => act(g, 0, { type: "buildRoad", edge: ownRoad })).toThrow(/taken/);
    give(g, 0, { wood: 1 }); // still missing brick
    expect(() => buildAnyRoad(g, 0)).toThrow(/no legal road/);
  });
});

describe("E1-06 settlements", () => {
  it("enforces the distance rule even on your own road network", () => {
    const g = toMain();
    give(g, 0, { wood: 1, brick: 1, wheat: 1, sheep: 1 });
    // the far end of player 0's setup road is adjacent to their settlement
    const settlement = g.players[0].settlements[0];
    const road = g.players[0].roads[0];
    const farEnd = g.board.edgeVertices[road].find((v) => v !== settlement)!;
    expect(() => act(g, 0, { type: "buildSettlement", vertex: farEnd })).toThrow(/too close/);
  });

  it("builds at distance 2 along an extended road, paying the full cost", () => {
    let g = toMain();
    give(g, 0, { wood: 9, brick: 9, wheat: 1, sheep: 1 });
    // extend the network until a legal settlement spot opens up
    let before = { ...g.players[0].resources };
    let settled: GameState | null = null;
    for (let i = 0; i < 8 && !settled; i++) {
      try {
        before = { ...g.players[0].resources };
        settled = buildAnySettlement(g, 0);
      } catch {
        g = buildAnyRoad(g, 0);
      }
    }
    expect(settled).not.toBeNull();
    g = settled!;
    expect(g.players[0].settlements).toHaveLength(3);
    expect(g.players[0].resources.wood).toBe(before.wood - 1);
    expect(g.players[0].resources.brick).toBe(before.brick - 1);
    expect(g.players[0].resources.wheat).toBe(before.wheat - 1);
    expect(g.players[0].resources.sheep).toBe(before.sheep - 1);
    // new settlement respects distance rule from every other building
    const v = g.players[0].settlements[2];
    expect(g.board.vertexNeighbors[v].every((n) => !g.buildings[n])).toBe(true);
  });

  it("requires one of your own roads at the vertex", () => {
    const g = toMain();
    give(g, 0, { wood: 1, brick: 1, wheat: 1, sheep: 1 });
    const lonely = g.board.vertices.find(
      (v) => spotFree(g, v) && g.board.vertexEdges[v].every((e) => g.roadOwner[e] === undefined),
    )!;
    expect(() => act(g, 0, { type: "buildSettlement", vertex: lonely })).toThrow(/your roads/);
  });
});

describe("E1-06 cities", () => {
  it("upgrades a settlement for 2 wheat + 3 ore and returns the settlement piece", () => {
    let g = toMain();
    give(g, 0, { wheat: 2, ore: 3 });
    const v = g.players[0].settlements[0];
    const stockBefore = { ...g.players[0].piecesLeft };
    g = act(g, 0, { type: "buildCity", vertex: v });
    expect(g.players[0].cities).toContain(v);
    expect(g.players[0].settlements).not.toContain(v);
    expect(g.buildings[v].type).toBe("city");
    expect(g.players[0].piecesLeft.cities).toBe(stockBefore.cities - 1);
    expect(g.players[0].piecesLeft.settlements).toBe(stockBefore.settlements + 1);
    expect(g.players[0].resources.wheat).toBe(0);
    expect(g.players[0].resources.ore).toBe(0);
  });

  it("only upgrades your own settlements", () => {
    const g = toMain();
    give(g, 0, { wheat: 2, ore: 3 });
    const enemy = g.players[1].settlements[0];
    expect(() => act(g, 0, { type: "buildCity", vertex: enemy })).toThrow(/settlement here/);
  });
});
