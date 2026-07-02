// E1-04 acceptance tests — dice + resource distribution
import { describe, expect, it } from "vitest";
import { GameState, Resource } from "../src/index.js";
import { act, assertConservation, autoSetup, newGame } from "./helpers.js";

/** Force a dice pair summing to n (2–12). */
const diceFor = (n: number): [number, number] => {
  const d1 = Math.max(1, n - 6);
  return [d1, n - d1];
};

/** Test-only: drop a building straight onto the board caches. */
function placeB(s: GameState, player: number, vertex: string, type: "settlement" | "city") {
  s.buildings[vertex] = { player, type };
  if (type === "settlement") s.players[player].settlements.push(vertex);
  else s.players[player].cities.push(vertex);
}

/** A produced tile (non-desert, has token) plus a clean game to fabricate on. */
function freshTileScenario() {
  const g = autoSetup(newGame(11));
  // wipe auto-setup buildings for a controlled scenario
  g.buildings = {};
  for (const p of g.players) {
    p.settlements = [];
    p.cities = [];
    for (const r of Object.keys(p.resources) as Resource[]) {
      g.bank[r] += p.resources[r];
      p.resources[r] = 0;
    }
  }
  const tile = g.board.tiles.find((t) => t.resource !== "desert" && t.id !== g.board.robberTile)!;
  return { g, tile, res: tile.resource as Resource };
}

describe("E1-04 production", () => {
  it("pays 1 per settlement and 2 per city on matching tiles", () => {
    const { g, tile, res } = freshTileScenario();
    const [v1, v2] = g.board.tileVertices[tile.id];
    placeB(g, 0, v1, "settlement");
    placeB(g, 1, v2, "city");
    const after = act(g, 0, { type: "roll", forced: diceFor(tile.token!) });
    expect(after.players[0].resources[res]).toBe(1);
    expect(after.players[1].resources[res]).toBe(2);
    assertConservation(after);
  });

  it("pays nothing on non-matching rolls", () => {
    const { g, tile, res } = freshTileScenario();
    placeB(g, 0, g.board.tileVertices[tile.id][0], "settlement");
    const otherRoll = tile.token === 6 ? 5 : 6;
    const after = act(g, 0, { type: "roll", forced: diceFor(otherRoll) });
    // only tiles with token === otherRoll paid; our tile did not
    const gained = after.players[0].resources[res];
    expect(gained).toBe(0);
  });

  it("robber blocks a tile's production entirely", () => {
    const { g, tile, res } = freshTileScenario();
    placeB(g, 0, g.board.tileVertices[tile.id][0], "settlement");
    g.board.robberTile = tile.id;
    const after = act(g, 0, { type: "roll", forced: diceFor(tile.token!) });
    expect(after.players[0].resources[res]).toBe(0);
  });

  it("bank shortage with multiple claimants: nobody is paid", () => {
    const { g, tile, res } = freshTileScenario();
    const [v1, v2] = g.board.tileVertices[tile.id];
    placeB(g, 0, v1, "settlement");
    placeB(g, 1, v2, "settlement");
    g.bank[res] = 1; // demand is 2
    const after = act(g, 0, { type: "roll", forced: diceFor(tile.token!) });
    expect(after.players[0].resources[res]).toBe(0);
    expect(after.players[1].resources[res]).toBe(0);
    expect(after.bank[res]).toBe(1);
  });

  it("bank shortage with a single claimant: they take what's left", () => {
    const { g, tile, res } = freshTileScenario();
    placeB(g, 0, g.board.tileVertices[tile.id][0], "city"); // demands 2
    g.bank[res] = 1;
    const after = act(g, 0, { type: "roll", forced: diceFor(tile.token!) });
    expect(after.players[0].resources[res]).toBe(1);
    expect(after.bank[res]).toBe(0);
  });
});
