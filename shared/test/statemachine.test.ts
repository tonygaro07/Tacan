// E1-03 acceptance tests — turn state machine & legal-transition checks
import { describe, expect, it } from "vitest";
import { RulesError } from "../src/index.js";
import { act, assertConservation, autoSetup, newGame, spotFree, tileAwayFrom } from "./helpers.js";

describe("E1-03 setup snake draft", () => {
  it("uses snake order 0,1,2,3,3,2,1,0 for 4 players", () => {
    const g = newGame();
    expect(g.setupOrder).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(g.phase).toBe("setup");
    expect(g.currentPlayer).toBe(0);
  });

  it("rejects out-of-turn and out-of-phase actions during setup", () => {
    const g = newGame();
    expect(() => act(g, 0, { type: "roll" })).toThrowError(RulesError);
    const v = g.board.vertices[0];
    expect(() => act(g, 1, { type: "placeSetupSettlement", vertex: v })).toThrowError(/not your turn/);
  });

  it("forces settlement → road sequencing and road adjacency", () => {
    let g = newGame();
    const v = g.board.vertices.find((x) => spotFree(g, x))!;
    g = act(g, 0, { type: "placeSetupSettlement", vertex: v });
    // second settlement before road: illegal
    expect(() => act(g, 0, { type: "placeSetupSettlement", vertex: g.board.vertices[20] })).toThrow(/road/);
    // road elsewhere on the map: illegal
    const farEdge = g.board.edges.find((e) => !g.board.edgeVertices[e].includes(v))!;
    expect(() => act(g, 0, { type: "placeSetupRoad", edge: farEdge })).toThrow(/touch/);
    // adjacent road: legal, and turn passes to player 1
    const edge = g.board.vertexEdges[v][0];
    g = act(g, 0, { type: "placeSetupRoad", edge });
    expect(g.currentPlayer).toBe(1);
  });

  it("completes setup into roll phase with starting resources from 2nd settlements", () => {
    const g = autoSetup(newGame());
    expect(g.phase).toBe("roll");
    expect(g.currentPlayer).toBe(0);
    expect(g.turn).toBe(1);
    for (const p of g.players) {
      expect(p.settlements).toHaveLength(2);
      expect(p.roads).toHaveLength(2);
      expect(p.piecesLeft).toEqual({ roads: 13, settlements: 3, cities: 4 });
    }
    assertConservation(g);
    // at least one player got starting resources (2nd settlement payout)
    const anyCards = g.players.some((p) => Object.values(p.resources).some((n) => n > 0));
    expect(anyCards).toBe(true);
  });
});

describe("E1-03 turn loop transitions", () => {
  it("roll(non-7) → main → endTurn → next player's roll", () => {
    let g = autoSetup(newGame());
    g = act(g, 0, { type: "roll", forced: [2, 3] });
    expect(g.phase).toBe("main");
    expect(g.dice).toEqual([2, 3]);
    // build actions are illegal outside main; roll is illegal inside main
    expect(() => act(g, 0, { type: "roll" })).toThrow(/not legal in phase/);
    g = act(g, 0, { type: "endTurn" });
    expect(g.phase).toBe("roll");
    expect(g.currentPlayer).toBe(1);
    expect(g.turn).toBe(2);
    expect(() => act(g, 1, { type: "buildRoad", edge: g.board.edges[0] })).toThrow(/not legal in phase/);
  });

  it("roll(7) with no fat hands → moveRobber → main", () => {
    let g = autoSetup(newGame());
    g = act(g, 0, { type: "roll", forced: [3, 4] });
    expect(g.phase).toBe("moveRobber");
    expect(() => act(g, 0, { type: "moveRobber", tile: g.board.robberTile })).toThrow(/different tile/);
    const target = tileAwayFrom(g, 0);
    g = act(g, 0, { type: "moveRobber", tile: target });
    expect(g.board.robberTile).toBe(target);
    expect(g.phase).toBe("main"); // nobody to steal from on that tile
  });

  it("only the current player may roll / end the turn", () => {
    let g = autoSetup(newGame());
    expect(() => act(g, 2, { type: "roll" })).toThrow(/not your turn/);
    g = act(g, 0, { type: "roll", forced: [2, 3] });
    expect(() => act(g, 2, { type: "endTurn" })).toThrow(/not your turn/);
  });

  it("no actions accepted after game over", () => {
    const g = autoSetup(newGame());
    g.winner = 2;
    expect(() => act(g, 0, { type: "roll" })).toThrow(/game is over/);
  });
});
