// E1-07 acceptance tests — bank 4:1, ports 3:1 / 2:1, player-to-player trades
import { describe, expect, it } from "vitest";
import { bankTradeRatio, GameState } from "../src/index.js";
import { act, autoSetup, clearHands, give, newGame } from "./helpers.js";

function toMain(seed = 33): GameState {
  const g = autoSetup(newGame(seed));
  const main = act(g, 0, { type: "roll", forced: [2, 3] });
  clearHands(main); // exact-count assertions need known hands
  return main;
}

/** Test-only: settle player p on a port of the given type. */
function settleOnPort(g: GameState, p: number, type: string): void {
  const port = g.board.ports.find((x) => x.type === type)!;
  const v = port.vertices[0];
  g.players[p].settlements.push(v);
  g.buildings[v] = { player: p, type: "settlement" };
}

describe("E1-07 bank & port trades", () => {
  it("defaults to 4:1 with no ports", () => {
    let g = toMain();
    expect(bankTradeRatio(g, 0, "wood")).toBe(4);
    give(g, 0, { wood: 4 });
    g = act(g, 0, { type: "bankTrade", give: "wood", want: "ore" });
    expect(g.players[0].resources.ore).toBe(1);
    expect(g.players[0].resources.wood).toBe(0);
  });

  it("rejects a 4:1 with only 3 cards, and same-resource trades", () => {
    const g = toMain();
    give(g, 0, { wood: 3 });
    expect(() => act(g, 0, { type: "bankTrade", give: "wood", want: "ore" })).toThrow(/need 4/);
    expect(() => act(g, 0, { type: "bankTrade", give: "wood", want: "wood" })).toThrow(/different/);
  });

  it("generic port unlocks 3:1 for everything; resource port 2:1 for that resource only", () => {
    const g = toMain();
    settleOnPort(g, 0, "generic");
    expect(bankTradeRatio(g, 0, "wood")).toBe(3);
    expect(bankTradeRatio(g, 0, "ore")).toBe(3);
    settleOnPort(g, 0, "wood");
    expect(bankTradeRatio(g, 0, "wood")).toBe(2);
    expect(bankTradeRatio(g, 0, "ore")).toBe(3); // wood port doesn't help ore
    // and port access is per-player: player 1 still pays 4
    expect(bankTradeRatio(g, 1, "wood")).toBe(4);
  });

  it("a 2:1 port trade moves exactly 2 out, 1 in", () => {
    let g = toMain();
    settleOnPort(g, 0, "sheep");
    give(g, 0, { sheep: 2 });
    g = act(g, 0, { type: "bankTrade", give: "sheep", want: "brick" });
    expect(g.players[0].resources.sheep).toBe(0);
    expect(g.players[0].resources.brick).toBe(1);
  });
});

describe("E1-07 player-to-player trades", () => {
  it("offer → accept swaps the exact resources", () => {
    let g = toMain();
    give(g, 0, { wood: 2 });
    give(g, 2, { ore: 1 });

    g = act(g, 0, { type: "offerTrade", give: { wood: 2 }, want: { ore: 1 } });
    expect(g.tradeOffer).not.toBeNull();
    g = act(g, 2, { type: "acceptTrade" });
    expect(g.tradeOffer).toBeNull();
    expect(g.players[0].resources.wood).toBe(0);
    expect(g.players[0].resources.ore).toBe(1);
    expect(g.players[2].resources.wood).toBe(2);
    expect(g.players[2].resources.ore).toBe(0);
  });

  it("validates both sides: offerer must hold the goods, acceptor must pay", () => {
    let g = toMain();
    // can't offer what you don't have
    expect(() => act(g, 0, { type: "offerTrade", give: { ore: 5 }, want: { wood: 1 } })).toThrow(/don't hold/);
    // empty-sided trades are rejected
    give(g, 0, { wood: 1 });
    expect(() => act(g, 0, { type: "offerTrade", give: { wood: 1 }, want: {} })).toThrow(/both sides/);
    // acceptor without the wanted cards is rejected
    g = act(g, 0, { type: "offerTrade", give: { wood: 1 }, want: { ore: 3 } });
    expect(() => act(g, 1, { type: "acceptTrade" })).toThrow(/don't hold/);
    // you can't accept your own offer
    expect(() => act(g, 0, { type: "acceptTrade" })).toThrow(/own offer/);
    // cancel clears it
    g = act(g, 0, { type: "cancelTrade" });
    expect(g.tradeOffer).toBeNull();
    expect(() => act(g, 1, { type: "acceptTrade" })).toThrow(/no open trade/);
  });
});
