// ---------------------------------------------------------------------------
// E1-10 — Full scripted 4-player game (the Session-1 stop condition)
//
// Scripted bots play complete games through the real reducer — every move is
// validated by the engine itself. Invariants are asserted throughout:
//   * resource conservation (bank + hands always sum to 19 per resource)
//   * piece accounting (roads/settlements/cities in play + in stock = totals)
//   * cache consistency (buildings/roadOwner mirror the player arrays)
// A finished game with a legitimate 10-VP winner proves the whole rulebook
// pipeline: setup → roll → produce/robber → trade → build → dev → win.
// ---------------------------------------------------------------------------
import { describe, expect, it } from "vitest";
import {
  Action, GameState, Player, RESOURCES, RulesError, victoryPoints,
} from "../src/index.js";
import { act, newGame, spotFree } from "./helpers.js";

const afford = (p: Player, cost: Partial<Record<string, number>>): boolean =>
  RESOURCES.every((r) => p.resources[r] >= (cost[r] ?? 0));

function tryEach(g: GameState, p: number, actions: Action[]): GameState | null {
  for (const a of actions) {
    try {
      return act(g, p, a);
    } catch (err) {
      if (!(err instanceof RulesError)) throw err;
    }
  }
  return null;
}

/** One greedy main-phase decision. Returns the next state (possibly endTurn). */
function botMain(g: GameState, p: number): GameState {
  const me = g.players[p];
  // 1. cities first (biggest VP per action)
  if (me.settlements.length > 0 && me.piecesLeft.cities > 0 && afford(me, { wheat: 2, ore: 3 })) {
    const next = tryEach(g, p, me.settlements.map((v) => ({ type: "buildCity", vertex: v } as Action)));
    if (next) return next;
  }
  // 2. settlements
  if (me.piecesLeft.settlements > 0 && afford(me, { wood: 1, brick: 1, wheat: 1, sheep: 1 })) {
    const next = tryEach(g, p, g.board.vertices.map((v) => ({ type: "buildSettlement", vertex: v } as Action)));
    if (next) return next;
  }
  // 3. dev cards (knights unblock the robber + build toward Largest Army)
  if (g.devDeck.length > 0 && afford(me, { wheat: 1, sheep: 1, ore: 1 })) {
    const next = tryEach(g, p, [{ type: "buyDevCard" }]);
    if (next) return next;
  }
  if (!g.playedDevThisTurn && me.devCards.some((c) => c.type === "knight" && c.boughtOnTurn < g.turn)) {
    const next = tryEach(g, p, [{ type: "playDevCard", card: "knight" }]);
    if (next) return next;
  }
  // 4. roads open new settlement spots
  if (me.roads.length < 12 && afford(me, { wood: 1, brick: 1 })) {
    const next = tryEach(g, p, g.board.edges.map((e) => ({ type: "buildRoad", edge: e } as Action)));
    if (next) return next;
  }
  // 5. bank-trade a surplus toward the scarcest resource
  for (const give of RESOURCES) {
    if (me.resources[give] >= 4) {
      const want = [...RESOURCES].sort((a, b) => me.resources[a] - me.resources[b]).find((r) => r !== give)!;
      const next = tryEach(g, p, [{ type: "bankTrade", give, want }]);
      if (next) return next;
    }
  }
  return act(g, p, { type: "endTurn" });
}

function invariants(g: GameState): void {
  // resource conservation
  for (const r of RESOURCES) {
    const total = g.bank[r] + g.players.reduce((s, p) => s + p.resources[r], 0);
    expect(total).toBe(19);
  }
  for (const [i, p] of g.players.entries()) {
    // piece accounting
    expect(p.roads.length + p.piecesLeft.roads).toBe(15);
    expect(p.settlements.length + p.cities.length + p.piecesLeft.settlements + p.piecesLeft.cities).toBe(9);
    expect(p.cities.length + p.piecesLeft.cities).toBe(4);
    // caches mirror reality
    for (const v of p.settlements) expect(g.buildings[v]).toEqual({ player: i, type: "settlement" });
    for (const v of p.cities) expect(g.buildings[v]).toEqual({ player: i, type: "city" });
    for (const e of p.roads) expect(g.roadOwner[e]).toBe(i);
  }
  expect(Object.keys(g.buildings)).toHaveLength(
    g.players.reduce((s, p) => s + p.settlements.length + p.cities.length, 0),
  );
}

function playFullGame(seed: number): { g: GameState; actions: number } {
  let g = newGame(seed);
  let actions = 0;
  const MAX = 30000;
  while (g.winner === null && actions < MAX) {
    actions++;
    const p = g.currentPlayer;
    switch (g.phase) {
      case "setup": {
        const vertex = g.board.vertices.find((v) => spotFree(g, v))!;
        g = act(g, p, { type: "placeSetupSettlement", vertex });
        const edge = g.board.vertexEdges[vertex].find((e) => g.roadOwner[e] === undefined)!;
        g = act(g, p, { type: "placeSetupRoad", edge });
        break;
      }
      case "roll":
        g = act(g, p, { type: "roll" }); // real seeded dice — no forcing
        break;
      case "discard": {
        const idx = Number(Object.keys(g.pendingDiscards)[0]);
        const need = g.pendingDiscards[idx];
        const hand = g.players[idx].resources;
        const dump: Partial<Record<(typeof RESOURCES)[number], number>> = {};
        let left = need;
        for (const r of RESOURCES) {
          const take = Math.min(hand[r], left);
          if (take > 0) { dump[r] = take; left -= take; }
        }
        g = act(g, idx, { type: "discard", resources: dump });
        break;
      }
      case "moveRobber": {
        const tile = g.board.tiles.find((t) => t.id !== g.board.robberTile)!;
        g = act(g, p, { type: "moveRobber", tile: tile.id });
        break;
      }
      case "steal": {
        const next = tryEach(g, p, [0, 1, 2, 3].filter((t) => t !== p).map((t) => ({ type: "steal", target: t } as Action)));
        if (!next) throw new Error("steal phase with no valid target — engine bug");
        g = next;
        break;
      }
      case "main":
        g = botMain(g, p);
        break;
      default:
        throw new Error(`unexpected phase ${g.phase}`);
    }
    if (actions % 100 === 0) invariants(g);
  }
  return { g, actions };
}

describe("E1-10 full scripted 4-player games", () => {
  it("seed 2026: plays a complete legal game to a 10-VP winner", () => {
    const { g, actions } = playFullGame(2026);
    expect(g.winner).not.toBeNull();
    expect(g.phase).toBe("gameOver");
    expect(victoryPoints(g, g.winner!, true)).toBeGreaterThanOrEqual(10);
    invariants(g);
    expect(actions).toBeLessThan(30000);
    // the log tells the story — setup completed and someone won
    expect(g.log.some((l) => l.includes("setup complete"))).toBe(true);
    expect(g.log.some((l) => l.includes("wins"))).toBe(true);
  }, 120000);

  it("seed 777: a different seed produces a different but equally legal game", () => {
    const { g } = playFullGame(777);
    expect(g.winner).not.toBeNull();
    expect(victoryPoints(g, g.winner!, true)).toBeGreaterThanOrEqual(10);
    invariants(g);
  }, 120000);

  it("determinism: the same seed replays the identical game", () => {
    const a = playFullGame(31337);
    const b = playFullGame(31337);
    expect(a.g.winner).toBe(b.g.winner);
    expect(a.actions).toBe(b.actions);
    expect(a.g.log).toEqual(b.g.log);
  }, 240000);
});
