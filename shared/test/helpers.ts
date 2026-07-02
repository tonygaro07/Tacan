// Shared test utilities — deterministic setup fast-forward + resource injection.
import {
  Action, applyAction, createGame, GameState, Resource, RESOURCES, ResourceCount,
} from "../src/index.js";

export const NAMES = ["Ana", "Beto", "Caro", "Dani"];

export function newGame(seed = 42, names: string[] = NAMES): GameState {
  return createGame({ playerNames: names, seed });
}

export const act = (s: GameState, p: number, a: Action): GameState => applyAction(s, p, a);

/** True if a settlement can legally sit at `v` per the distance rule. */
export function spotFree(s: GameState, v: string): boolean {
  if (s.buildings[v]) return false;
  return s.board.vertexNeighbors[v].every((n) => !s.buildings[n]);
}

/** Plays the whole snake draft with the first legal spot each time. */
export function autoSetup(s: GameState): GameState {
  while (s.phase === "setup") {
    const p = s.currentPlayer;
    const vertex = s.board.vertices.find((v) => spotFree(s, v))!;
    s = act(s, p, { type: "placeSetupSettlement", vertex });
    const edge = s.board.vertexEdges[vertex].find((e) => s.roadOwner[e] === undefined)!;
    s = act(s, p, { type: "placeSetupRoad", edge });
  }
  return s;
}

/** Test-only: hand a player resources straight from the bank (keeps conservation intact). */
export function give(s: GameState, playerIdx: number, res: Partial<ResourceCount>): void {
  for (const r of RESOURCES) {
    const amt = res[r] ?? 0;
    s.bank[r] -= amt;
    s.players[playerIdx].resources[r] += amt;
  }
}

/** Conservation invariant: every resource type sums to 19 across bank + all hands. */
export function assertConservation(s: GameState): void {
  for (const r of RESOURCES) {
    const total = s.bank[r] + s.players.reduce((sum, p) => sum + p.resources[r], 0);
    if (total !== 19) throw new Error(`conservation broken for ${r}: ${total} != 19`);
  }
}

/** Test-only: return every player's hand to the bank for exact-count scenarios. */
export function clearHands(s: GameState): void {
  for (const p of s.players) {
    for (const r of RESOURCES) {
      s.bank[r] += p.resources[r];
      p.resources[r] = 0;
    }
  }
}

export function totalCards(s: GameState, playerIdx: number): number {
  return RESOURCES.reduce((sum, r) => sum + s.players[playerIdx].resources[r], 0);
}

/** Find a tile id where the given player has no building adjacent (robber-safe target). */
export function tileAwayFrom(s: GameState, playerIdx: number): string {
  return s.board.tiles.find(
    (t) =>
      t.id !== s.board.robberTile &&
      s.board.tileVertices[t.id].every((v) => {
        const b = s.buildings[v];
        return !b || b.player === playerIdx;
      }),
  )!.id;
}

export const res = (r: Resource, n: number): Partial<ResourceCount> => ({ [r]: n });
