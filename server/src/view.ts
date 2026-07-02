// ---------------------------------------------------------------------------
// E2-03 — per-player state redaction
//
// The server holds the full authoritative GameState. Each client receives a
// personalized view. What gets hidden and why:
//   * seed          — leaks every future dice roll and shuffle
//   * devDeck order — leaks upcoming draws (only the count is public)
//   * opponents' hands & dev cards — hidden info in the rulebook; opponents
//     see counts only (that's also all a human sees at a real table)
// Everything else (board, buildings, roads, awards, log) is public knowledge.
// ---------------------------------------------------------------------------
import { GameState, Player, RESOURCES } from "@tacan/rules";

export interface OpponentView extends Omit<Player, "resources" | "devCards"> {
  resources: null;
  devCards: null;
  resourceCount: number;
  devCardCount: number;
}

export interface SelfView extends Player {
  resourceCount: number;
  devCardCount: number;
}

export type ClientView = Omit<GameState, "seed" | "devDeck" | "players"> & {
  yourSeat: number;
  devDeckCount: number;
  players: (SelfView | OpponentView)[];
};

const handSize = (p: Player): number => RESOURCES.reduce((s, r) => s + p.resources[r], 0);

export function redactStateFor(state: GameState, seat: number): ClientView {
  const { seed: _seed, devDeck, players, ...publicState } = structuredClone(state);
  return {
    ...publicState,
    yourSeat: seat,
    devDeckCount: devDeck.length,
    players: players.map((p, i) => {
      const counts = { resourceCount: handSize(p), devCardCount: p.devCards.length };
      if (i === seat) return { ...p, ...counts };
      return { ...p, ...counts, resources: null, devCards: null };
    }),
  };
}
