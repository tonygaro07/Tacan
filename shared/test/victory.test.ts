// E1-09 acceptance tests — VP calculator, Longest Road, Largest Army, win at 10
import { describe, expect, it } from "vitest";
import {
  GameState, longestRoadLength, updateLargestArmy, updateLongestRoad, victoryPoints,
} from "../src/index.js";
import { act, autoSetup, clearHands, give, newGame } from "./helpers.js";

function toMain(seed = 77): GameState {
  const g = autoSetup(newGame(seed));
  const main = act(g, 0, { type: "roll", forced: [2, 3] });
  clearHands(main);
  return main;
}

/** Test-only: lay a simple path of n connected road edges for a player. */
function fabricatePath(g: GameState, p: number, n: number, avoid: Set<string> = new Set()): string[] {
  const starts = g.board.vertices.filter(
    (v) => !avoid.has(v) && g.board.vertexEdges[v].every((e) => g.roadOwner[e] === undefined),
  );
  outer: for (const start of starts) {
    const path: string[] = [];
    const visited = new Set([start]);
    let cur = start;
    while (path.length < n) {
      const e = g.board.vertexEdges[cur].find((x) => {
        if (g.roadOwner[x] !== undefined || path.includes(x)) return false;
        const [a, b] = g.board.edgeVertices[x];
        const nxt = a === cur ? b : a;
        return !visited.has(nxt) && !avoid.has(nxt);
      });
      if (!e) continue outer; // dead end — try the next start vertex
      path.push(e);
      const [a, b] = g.board.edgeVertices[e];
      cur = a === cur ? b : a;
      visited.add(cur);
    }
    for (const e of path) {
      g.roadOwner[e] = p;
      g.players[p].roads.push(e);
    }
    return [...visited];
  }
  throw new Error("could not fabricate path");
}

describe("E1-09 VP calculator", () => {
  it("scores 1/settlement and 2/city; setup leaves everyone at 2 VP", () => {
    const g = toMain();
    for (let i = 0; i < 4; i++) expect(victoryPoints(g, i, true)).toBe(2);
    give(g, 0, { wheat: 2, ore: 3 });
    const after = act(g, 0, { type: "buildCity", vertex: g.players[0].settlements[0] });
    expect(victoryPoints(after, 0, true)).toBe(3);
  });

  it("hidden VP dev cards count only when includeHidden is set", () => {
    const g = toMain();
    g.players[0].devCards.push({ type: "victoryPoint", boughtOnTurn: 0 });
    expect(victoryPoints(g, 0, false)).toBe(2); // what opponents see
    expect(victoryPoints(g, 0, true)).toBe(3);  // true score
  });
});

describe("E1-09 Longest Road", () => {
  it("needs 5+ segments, transfers only on strict overtake, and ignores 4-chains", () => {
    const g = toMain();
    // player 2's setup roads alone (2 disconnected edges) never qualify
    updateLongestRoad(g);
    expect(g.longestRoad.holder).toBeNull();

    const used = new Set<string>(Object.keys(g.buildings));
    fabricatePath(g, 0, 5, used).forEach((v) => used.add(v));
    updateLongestRoad(g);
    expect(g.longestRoad).toEqual({ holder: 0, length: 5 });

    // a tie (another 5-chain) does NOT steal the award
    fabricatePath(g, 1, 5, used).forEach((v) => used.add(v));
    updateLongestRoad(g);
    expect(g.longestRoad.holder).toBe(0);

    // a strict overtake (6-chain) does
    fabricatePath(g, 2, 6, used);
    updateLongestRoad(g);
    expect(g.longestRoad).toEqual({ holder: 2, length: 6 });
    expect(victoryPoints(g, 2, true)).toBe(2 + 2);
  });

  it("an opponent settlement mid-path breaks the road", () => {
    const g = toMain();
    const used = new Set<string>(Object.keys(g.buildings));
    const pathVerts = fabricatePath(g, 0, 5, used);
    updateLongestRoad(g);
    expect(g.longestRoad.holder).toBe(0);
    // drop an enemy settlement on the middle vertex of the chain
    const mid = pathVerts[3]; // path visits 6 vertices; index 3 splits 3/2
    g.buildings[mid] = { player: 1, type: "settlement" };
    g.players[1].settlements.push(mid);
    expect(longestRoadLength(g, 0)).toBeLessThan(5);
    updateLongestRoad(g);
    expect(g.longestRoad.holder).toBeNull(); // nobody else has 5
  });
});

describe("E1-09 Largest Army", () => {
  it("needs 3+ knights and transfers only on strict overtake", () => {
    const g = toMain();
    g.players[0].playedKnights = 2;
    updateLargestArmy(g, 0);
    expect(g.largestArmy.holder).toBeNull();
    g.players[0].playedKnights = 3;
    updateLargestArmy(g, 0);
    expect(g.largestArmy).toEqual({ holder: 0, size: 3 });
    expect(victoryPoints(g, 0, true)).toBe(4);
    g.players[1].playedKnights = 3; // tie — no steal
    updateLargestArmy(g, 1);
    expect(g.largestArmy.holder).toBe(0);
    g.players[1].playedKnights = 4; // strict overtake — steal
    updateLargestArmy(g, 1);
    expect(g.largestArmy).toEqual({ holder: 1, size: 4 });
  });
});

describe("E1-09 win detection", () => {
  it("declares the winner the moment the current player reaches 10 VP", () => {
    let g = toMain();
    // fabricate 9 visible VP for player 0: 3 cities + 1 settlement + largest army
    const p0 = g.players[0];
    p0.cities = ["c1", "c2", "c3"]; // VP calc counts arrays; board legality not at issue here
    p0.settlements = ["s1"];
    g.largestArmy = { holder: 0, size: 3 };
    expect(victoryPoints(g, 0, true)).toBe(9);
    expect(g.winner).toBeNull();
    // the 10th point arrives via a hidden VP card + any action triggering the check
    p0.devCards.push({ type: "victoryPoint", boughtOnTurn: 0 });
    give(g, 0, { wheat: 1, sheep: 1, ore: 1 });
    g = act(g, 0, { type: "buyDevCard" });
    expect(g.winner).toBe(0);
    expect(g.phase).toBe("gameOver");
  });

  it("a player who reaches 10 off-turn wins at the start of their own turn", () => {
    let g = toMain();
    const p1 = g.players[1];
    p1.cities = ["c1", "c2", "c3", "c4"]; // 8
    p1.settlements = ["s1", "s2"];        // +2 = 10
    expect(g.winner).toBeNull();
    g = act(g, 0, { type: "endTurn" }); // turn passes to player 1
    expect(g.winner).toBe(1);
    expect(g.phase).toBe("gameOver");
  });
});
