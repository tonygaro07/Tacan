// ---------------------------------------------------------------------------
// E1-09 — Victory points, Longest Road, Largest Army, win detection
// ---------------------------------------------------------------------------

import { GameState, WIN_VP } from "./types.js";

/** Owner of a building at a vertex, or null. */
export function buildingOwnerAt(state: GameState, vertex: string): number | null {
  const b = state.buildings[vertex];
  return b ? b.player : null;
}

/**
 * Longest simple road path (in edges) for one player.
 * A path may END at a vertex holding an opponent's building but can't pass
 * THROUGH it (that's how settlements "break" roads).
 * Exhaustive DFS — players hold ≤15 roads, so this is cheap.
 */
export function longestRoadLength(state: GameState, playerIdx: number): number {
  const roadSet = new Set(state.players[playerIdx].roads);
  const blocked = (v: string) => {
    const owner = buildingOwnerAt(state, v);
    return owner !== null && owner !== playerIdx;
  };
  let best = 0;
  const used = new Set<string>();
  const dfs = (v: string, len: number) => {
    if (len > best) best = len;
    if (len > 0 && blocked(v)) return; // opponent building: path ends here
    for (const e of state.board.vertexEdges[v]) {
      if (!roadSet.has(e) || used.has(e)) continue;
      const [a, b] = state.board.edgeVertices[e];
      used.add(e);
      dfs(a === v ? b : a, len + 1);
      used.delete(e);
    }
  };
  for (const e of roadSet) {
    for (const v of state.board.edgeVertices[e]) dfs(v, 0);
  }
  return best;
}

/**
 * Longest Road award (min 5, steal only on strict overtake).
 * Ties: current holder keeps; with no holder, a tie awards nobody
 * (documented simplification — matches how the card behaves in practice,
 * since roads are built one at a time).
 */
export function updateLongestRoad(state: GameState): void {
  const lens = state.players.map((_, i) => longestRoadLength(state, i));
  let { holder } = state.longestRoad;

  if (holder !== null && lens[holder] < 5) holder = null; // broken by a settlement

  const currentBest = holder !== null ? lens[holder] : 4;
  let challenger: number | null = null;
  let challengerLen = currentBest;
  for (let i = 0; i < lens.length; i++) {
    if (i === holder) continue;
    if (lens[i] > challengerLen) {
      challengerLen = lens[i];
      challenger = i;
    } else if (lens[i] === challengerLen && challenger !== null) {
      challenger = null; // tie between challengers: nobody takes it
      challengerLen = currentBest;
    }
  }
  if (challenger !== null) holder = challenger;
  state.longestRoad = { holder, length: holder !== null ? lens[holder] : 0 };
}

/** Largest Army (min 3 knights, steal on strict overtake). */
export function updateLargestArmy(state: GameState, playerIdx: number): void {
  const knights = state.players[playerIdx].playedKnights;
  const { holder, size } = state.largestArmy;
  if (knights >= 3 && (holder === null ? knights >= 3 : knights > size)) {
    state.largestArmy = { holder: playerIdx, size: knights };
  }
}

/** @param includeHidden count unrevealed VP dev cards (true for win checks / final scores) */
export function victoryPoints(state: GameState, playerIdx: number, includeHidden: boolean): number {
  const p = state.players[playerIdx];
  let vp = p.settlements.length + p.cities.length * 2;
  if (state.longestRoad.holder === playerIdx) vp += 2;
  if (state.largestArmy.holder === playerIdx) vp += 2;
  if (includeHidden) vp += p.devCards.filter((c) => c.type === "victoryPoint").length;
  return vp;
}

/** Only the player whose turn it is can win (standard rule). */
export function checkWin(state: GameState): void {
  if (state.winner !== null) return;
  if (victoryPoints(state, state.currentPlayer, true) >= WIN_VP) {
    state.winner = state.currentPlayer;
    state.phase = "gameOver";
    state.log.push(`P${state.currentPlayer} wins with ${victoryPoints(state, state.currentPlayer, true)} VP`);
  }
}
