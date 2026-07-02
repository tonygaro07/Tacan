// E1-05 acceptance tests — the full robber sequence on a 7
import { describe, expect, it } from "vitest";
import { act, assertConservation, autoSetup, give, newGame, totalCards } from "./helpers.js";

describe("E1-05 robber", () => {
  it("a 7 skips production and forces 8+ card hands to discard half (rounded down)", () => {
    let g = autoSetup(newGame(5));
    // reset hands to exact sizes
    for (let i = 0; i < 4; i++) {
      for (const [r, n] of Object.entries(g.players[i].resources)) {
        g.bank[r as keyof typeof g.bank] += n;
        g.players[i].resources[r as keyof typeof g.bank] = 0;
      }
    }
    give(g, 0, { wood: 9 });        // 9 cards -> discard 4
    give(g, 1, { brick: 8 });       // 8 cards -> discard 4
    give(g, 2, { sheep: 7 });       // 7 cards -> safe
    const before = g.players.map((_, i) => totalCards(g, i));

    g = act(g, 0, { type: "roll", forced: [3, 4] });
    expect(g.phase).toBe("discard");
    expect(g.pendingDiscards).toEqual({ 0: 4, 1: 4 });
    // nobody produced anything on a 7
    g.players.forEach((_, i) => expect(totalCards(g, i)).toBe(before[i]));

    // wrong discard count rejected; cards you don't hold rejected
    expect(() => act(g, 0, { type: "discard", resources: { wood: 3 } })).toThrow(/exactly 4/);
    expect(() => act(g, 0, { type: "discard", resources: { ore: 4 } })).toThrow(/don't hold/);
    // player with no discard due can't discard
    expect(() => act(g, 2, { type: "discard", resources: { sheep: 3 } })).toThrow(/nothing to discard/);

    g = act(g, 0, { type: "discard", resources: { wood: 4 } });
    expect(g.phase).toBe("discard"); // still waiting on player 1
    g = act(g, 1, { type: "discard", resources: { brick: 4 } });
    expect(g.phase).toBe("moveRobber");
    expect(totalCards(g, 0)).toBe(5);
    expect(totalCards(g, 1)).toBe(4);
    assertConservation(g);
  });

  it("moving the robber next to an opponent with cards forces a steal", () => {
    let g = autoSetup(newGame(5));
    // ensure player 1 has exactly one known card and others adjacent have none
    for (let i = 0; i < 4; i++) {
      for (const [r, n] of Object.entries(g.players[i].resources)) {
        g.bank[r as keyof typeof g.bank] += n;
        g.players[i].resources[r as keyof typeof g.bank] = 0;
      }
    }
    give(g, 1, { ore: 1 });

    // find a tile adjacent to one of player 1's buildings
    const targetTile = g.board.tiles.find(
      (t) =>
        t.id !== g.board.robberTile &&
        g.board.tileVertices[t.id].some((v) => g.buildings[v]?.player === 1),
    )!;

    g = act(g, 0, { type: "roll", forced: [3, 4] }); // nobody has 8+, straight to moveRobber
    expect(g.phase).toBe("moveRobber");
    g = act(g, 0, { type: "moveRobber", tile: targetTile.id });
    expect(g.phase).toBe("steal");

    // stealing from someone not adjacent (or cardless) is rejected
    expect(() => act(g, 0, { type: "steal", target: 3 })).toThrow(/not adjacent|no cards/);

    g = act(g, 0, { type: "steal", target: 1 });
    expect(g.phase).toBe("main");
    expect(g.players[0].resources.ore).toBe(1); // the only card P1 held
    expect(totalCards(g, 1)).toBe(0);
    assertConservation(g);
  });
});
