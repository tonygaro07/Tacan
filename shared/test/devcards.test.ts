// E1-08 acceptance tests — dev cards: buy, same-turn block, one-per-turn, effects
import { describe, expect, it } from "vitest";
import { GameState } from "../src/index.js";
import { act, autoSetup, clearHands, give, newGame } from "./helpers.js";

function toMain(seed = 55): GameState {
  const g = autoSetup(newGame(seed));
  const main = act(g, 0, { type: "roll", forced: [2, 3] });
  clearHands(main);
  return main;
}

/** Test-only: put a playable card of the given type in a player's hand. */
function handCard(g: GameState, p: number, type: any, boughtOnTurn = 0): void {
  g.players[p].devCards.push({ type, boughtOnTurn });
}

describe("E1-08 buying", () => {
  it("costs wheat+sheep+ore, draws from the deck, and is locked for the turn it was bought", () => {
    let g = toMain();
    give(g, 0, { wheat: 1, sheep: 1, ore: 1 });
    g.devDeck[g.devDeck.length - 1] = "knight"; // control the draw
    const deckBefore = g.devDeck.length;
    g = act(g, 0, { type: "buyDevCard" });
    expect(g.devDeck).toHaveLength(deckBefore - 1);
    expect(g.players[0].devCards).toEqual([{ type: "knight", boughtOnTurn: 1 }]);
    expect(g.players[0].resources.wheat).toBe(0);
    // can't play it the same turn
    expect(() => act(g, 0, { type: "playDevCard", card: "knight" })).toThrow(/turn they're bought/);
  });

  it("rejects the buy without the resources or with an empty deck", () => {
    const g = toMain();
    expect(() => act(g, 0, { type: "buyDevCard" })).toThrow(/costs/);
    give(g, 0, { wheat: 1, sheep: 1, ore: 1 });
    g.devDeck = [];
    expect(() => act(g, 0, { type: "buyDevCard" })).toThrow(/empty/);
  });
});

describe("E1-08 effects", () => {
  it("knight: robber moves, victim robbed, army counter up — one dev card per turn", () => {
    let g = toMain();
    handCard(g, 0, "knight");
    handCard(g, 0, "monopoly");
    give(g, 1, { ore: 1 });
    g = act(g, 0, { type: "playDevCard", card: "knight" });
    expect(g.players[0].playedKnights).toBe(1);
    expect(g.phase).toBe("moveRobber");
    const target = g.board.tiles.find(
      (t) => t.id !== g.board.robberTile &&
        g.board.tileVertices[t.id].some((v) => g.buildings[v]?.player === 1),
    )!;
    g = act(g, 0, { type: "moveRobber", tile: target.id });
    expect(g.phase).toBe("steal");
    g = act(g, 0, { type: "steal", target: 1 });
    expect(g.phase).toBe("main");
    expect(g.players[0].resources.ore).toBe(1);
    // second dev card the same turn: rejected
    expect(() => act(g, 0, { type: "playDevCard", card: "monopoly", resource: "wood" })).toThrow(/one dev card/);
  });

  it("roadBuilding: two free roads, then costs resume", () => {
    let g = toMain();
    handCard(g, 0, "roadBuilding");
    g = act(g, 0, { type: "playDevCard", card: "roadBuilding" });
    expect(g.pendingFreeRoads).toBe(2);
    const roadsBefore = g.players[0].roads.length;
    let built = 0;
    for (const e of g.board.edges) {
      if (built === 2) break;
      try {
        g = act(g, 0, { type: "buildRoad", edge: e });
        built++;
      } catch { /* try next edge */ }
    }
    expect(built).toBe(2);
    expect(g.players[0].roads).toHaveLength(roadsBefore + 2);
    expect(g.pendingFreeRoads).toBe(0);
    // third road now needs wood+brick again
    expect(() =>
      g.board.edges.forEach((e) => act(g, 0, { type: "buildRoad", edge: e })),
    ).toThrow();
  });

  it("yearOfPlenty: exactly two chosen resources from the bank", () => {
    let g = toMain();
    handCard(g, 0, "yearOfPlenty");
    g = act(g, 0, { type: "playDevCard", card: "yearOfPlenty", resources: ["ore", "ore"] });
    expect(g.players[0].resources.ore).toBe(2);
    expect(g.bank.ore).toBe(17);
  });

  it("monopoly: strips the named resource from every opponent", () => {
    let g = toMain();
    handCard(g, 0, "monopoly");
    give(g, 1, { wheat: 3 });
    give(g, 2, { wheat: 2 });
    give(g, 3, { wood: 1 });
    g = act(g, 0, { type: "playDevCard", card: "monopoly", resource: "wheat" });
    expect(g.players[0].resources.wheat).toBe(5);
    expect(g.players[1].resources.wheat).toBe(0);
    expect(g.players[2].resources.wheat).toBe(0);
    expect(g.players[3].resources.wood).toBe(1); // untouched
  });

  it("victory point cards are never 'played' — they just count (E1-09 verifies scoring)", () => {
    const g = toMain();
    handCard(g, 0, "victoryPoint");
    // the action type doesn't even accept them; a knight-style attempt finds no card
    expect(() => act(g, 0, { type: "playDevCard", card: "knight" })).toThrow(/no playable/);
  });
});
