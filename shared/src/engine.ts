// ---------------------------------------------------------------------------
// Tacan rules engine — turn state machine + action reducer
// E1-03 (state machine), E1-04 (production), E1-05 (robber),
// E1-06 (build validation), E1-07 (trading), E1-08 (dev cards)
//
// Design contract: applyAction(state, player, action) is a PURE function —
// it never mutates its input; it returns a fresh state or throws RulesError.
// The Colyseus server (Epic 2) calls this and broadcasts the result. Clients
// send intents only. That's the server-authoritative boundary from §3.
// ---------------------------------------------------------------------------

import {
  Action, COSTS, DISCARD_THRESHOLD, DevCard, GameState, Player, PortType,
  Resource, RESOURCES, ResourceCount, RulesError, zeroResources,
} from "./types.js";
import { generateBoard } from "./board.js";
import { randInt, rollDie, shuffle } from "./rng.js";
import { checkWin, updateLargestArmy, updateLongestRoad } from "./victory.js";

// ---------------------------------------------------------------- creation

export interface GameOptions {
  playerNames: string[];
  seed: number;
}

const DEV_DECK_POOL: DevCard[] = [
  ...Array<DevCard>(14).fill("knight"),
  "roadBuilding", "roadBuilding",
  "yearOfPlenty", "yearOfPlenty",
  "monopoly", "monopoly",
  ...Array<DevCard>(5).fill("victoryPoint"),
];

export function createGame(opts: GameOptions): GameState {
  const n = opts.playerNames.length;
  if (n < 3 || n > 6) throw new RulesError("PLAYER_COUNT", "Tacan supports 3–6 players");

  let seed = opts.seed;
  const board = generateBoard(seed);
  seed = (seed + 0x9e3779b9) | 0; // decouple board rng from game rng
  let devDeck: DevCard[];
  [devDeck, seed] = shuffle(DEV_DECK_POOL, seed);

  const players: Player[] = opts.playerNames.map((name) => ({
    name,
    resources: zeroResources(),
    devCards: [],
    playedKnights: 0,
    roads: [],
    settlements: [],
    cities: [],
    piecesLeft: { roads: 15, settlements: 5, cities: 4 },
  }));

  const forward = players.map((_, i) => i);
  const setupOrder = [...forward, ...forward.slice().reverse()]; // snake draft

  return {
    seed,
    turn: 0,
    phase: "setup",
    currentPlayer: setupOrder[0],
    players,
    board,
    bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 },
    devDeck,
    dice: null,
    setupOrder,
    setupIndex: 0,
    awaitingSetupRoad: false,
    lastSettlement: null,
    pendingDiscards: {},
    tradeOffer: null,
    playedDevThisTurn: false,
    pendingFreeRoads: 0,
    buildings: {},
    roadOwner: {},
    longestRoad: { holder: null, length: 0 },
    largestArmy: { holder: null, size: 0 },
    winner: null,
    log: [],
  };
}

// ---------------------------------------------------------------- helpers

export const totalResourceCards = (p: Player): number =>
  RESOURCES.reduce((sum, r) => sum + p.resources[r], 0);

const sumPartial = (c: Partial<ResourceCount>): number =>
  RESOURCES.reduce((s, r) => s + (c[r] ?? 0), 0);

function hasResources(p: Player, cost: Partial<ResourceCount>): boolean {
  return RESOURCES.every((r) => p.resources[r] >= (cost[r] ?? 0));
}

function transferToBank(state: GameState, p: Player, cost: Partial<ResourceCount>): void {
  for (const r of RESOURCES) {
    const amt = cost[r] ?? 0;
    p.resources[r] -= amt;
    state.bank[r] += amt;
  }
}

function grantFromBank(state: GameState, p: Player, res: Resource, amount: number): number {
  const granted = Math.min(amount, state.bank[res]);
  state.bank[res] -= granted;
  p.resources[res] += granted;
  return granted;
}

function assert(cond: unknown, code: string, msg: string): asserts cond {
  if (!cond) throw new RulesError(code, msg);
}

/** Port types this player has settled on (E1-07: port access comes from placement). */
export function portsOf(state: GameState, playerIdx: number): Set<PortType> {
  const p = state.players[playerIdx];
  const mine = new Set([...p.settlements, ...p.cities]);
  const out = new Set<PortType>();
  for (const port of state.board.ports) {
    if (port.vertices.some((v) => mine.has(v))) out.add(port.type);
  }
  return out;
}

export function bankTradeRatio(state: GameState, playerIdx: number, give: Resource): number {
  const ports = portsOf(state, playerIdx);
  if (ports.has(give)) return 2;
  if (ports.has("generic")) return 3;
  return 4;
}

/** Distance rule: no building on the vertex or any neighboring vertex. */
function settlementSpotFree(state: GameState, vertex: string): boolean {
  if (state.buildings[vertex]) return false;
  return state.board.vertexNeighbors[vertex].every((v) => !state.buildings[v]);
}

/** Road connectivity: touches an own building, or continues an own road not cut by an opponent building. */
function roadConnected(state: GameState, playerIdx: number, edge: string): boolean {
  for (const v of state.board.edgeVertices[edge]) {
    const b = state.buildings[v];
    if (b && b.player === playerIdx) return true;
    if (b && b.player !== playerIdx) continue; // opponent building blocks continuation through v
    if (state.board.vertexEdges[v].some((e) => e !== edge && state.roadOwner[e] === playerIdx)) return true;
  }
  return false;
}

function placeBuildingCaches(state: GameState, playerIdx: number, vertex: string, type: "settlement" | "city"): void {
  state.buildings[vertex] = { player: playerIdx, type };
}

// E1-04 — production, including the bank-shortage rule:
// if a resource can't fully pay out and MORE THAN ONE player is owed it,
// nobody receives that resource; a single player takes what's left.
function produce(state: GameState, roll: number): void {
  const gains = state.players.map(() => zeroResources());
  for (const tile of state.board.tiles) {
    if (tile.token !== roll || tile.resource === "desert" || tile.id === state.board.robberTile) continue;
    for (const v of state.board.tileVertices[tile.id]) {
      const b = state.buildings[v];
      if (!b) continue;
      gains[b.player][tile.resource as Resource] += b.type === "city" ? 2 : 1;
    }
  }
  for (const r of RESOURCES) {
    const demand = gains.reduce((s, g) => s + g[r], 0);
    if (demand === 0) continue;
    if (demand > state.bank[r]) {
      const receivers = gains.filter((g) => g[r] > 0).length;
      if (receivers > 1) {
        for (const g of gains) g[r] = 0;
        state.log.push(`bank short on ${r}: nobody paid`);
      } else {
        const idx = gains.findIndex((g) => g[r] > 0);
        gains[idx][r] = state.bank[r];
      }
    }
  }
  state.players.forEach((p, i) => {
    for (const r of RESOURCES) {
      state.bank[r] -= gains[i][r];
      p.resources[r] += gains[i][r];
    }
  });
}

function robberVictims(state: GameState): number[] {
  const victims = new Set<number>();
  for (const v of state.board.tileVertices[state.board.robberTile]) {
    const b = state.buildings[v];
    if (b && b.player !== state.currentPlayer && totalResourceCards(state.players[b.player]) > 0) {
      victims.add(b.player);
    }
  }
  return [...victims];
}

function stealRandomCard(state: GameState, from: number, to: number): void {
  const victim = state.players[from];
  const pool: Resource[] = [];
  for (const r of RESOURCES) for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
  if (pool.length === 0) return;
  let idx: number;
  [idx, state.seed] = randInt(state.seed, pool.length);
  const res = pool[idx];
  victim.resources[res]--;
  state.players[to].resources[res]++;
  state.log.push(`P${to} stole 1 ${res} from P${from}`);
}

// ---------------------------------------------------------------- reducer

export function applyAction(prev: GameState, playerIdx: number, action: Action): GameState {
  assert(prev.winner === null, "GAME_OVER", "game is over");
  const state = structuredClone(prev);
  const me = state.players[playerIdx];
  assert(me, "BAD_PLAYER", "unknown player");

  const requireTurn = () =>
    assert(playerIdx === state.currentPlayer, "NOT_YOUR_TURN", "not your turn");
  const requirePhase = (...phases: GameState["phase"][]) =>
    assert(phases.includes(state.phase), "WRONG_PHASE", `action ${action.type} not legal in phase ${state.phase}`);

  switch (action.type) {
    // ------------------------------------------------------ setup (snake)
    case "placeSetupSettlement": {
      requirePhase("setup");
      requireTurn();
      assert(!state.awaitingSetupRoad, "SEQUENCE", "place the road for your settlement first");
      assert(state.board.vertexTiles[action.vertex], "BAD_VERTEX", "unknown vertex");
      assert(settlementSpotFree(state, action.vertex), "DISTANCE_RULE", "too close to another settlement");
      me.settlements.push(action.vertex);
      me.piecesLeft.settlements--;
      placeBuildingCaches(state, playerIdx, action.vertex, "settlement");
      // second-round settlement produces starting resources
      if (state.setupIndex >= state.players.length) {
        for (const tid of state.board.vertexTiles[action.vertex]) {
          const tile = state.board.tiles.find((t) => t.id === tid)!;
          if (tile.resource !== "desert") grantFromBank(state, me, tile.resource, 1);
        }
      }
      state.awaitingSetupRoad = true;
      state.lastSettlement = action.vertex;
      break;
    }
    case "placeSetupRoad": {
      requirePhase("setup");
      requireTurn();
      assert(state.awaitingSetupRoad && state.lastSettlement, "SEQUENCE", "place a settlement first");
      assert(state.board.edgeVertices[action.edge], "BAD_EDGE", "unknown edge");
      assert(state.roadOwner[action.edge] === undefined, "OCCUPIED", "edge taken");
      assert(state.board.edgeVertices[action.edge].includes(state.lastSettlement), "SETUP_ROAD", "road must touch the settlement you just placed");
      me.roads.push(action.edge);
      me.piecesLeft.roads--;
      state.roadOwner[action.edge] = playerIdx;
      state.awaitingSetupRoad = false;
      state.lastSettlement = null;
      state.setupIndex++;
      if (state.setupIndex >= state.setupOrder.length) {
        state.phase = "roll";
        state.currentPlayer = state.setupOrder[0];
        state.turn = 1;
        state.log.push("setup complete");
      } else {
        state.currentPlayer = state.setupOrder[state.setupIndex];
      }
      break;
    }

    // ------------------------------------------------------ roll & produce
    case "roll": {
      requirePhase("roll");
      requireTurn();
      let d1: number, d2: number;
      if (action.forced) {
        [d1, d2] = action.forced;
      } else {
        [d1, state.seed] = rollDie(state.seed);
        [d2, state.seed] = rollDie(state.seed);
      }
      state.dice = [d1, d2];
      const sum = d1 + d2;
      state.log.push(`P${playerIdx} rolled ${sum}`);
      if (sum === 7) {
        state.pendingDiscards = {};
        state.players.forEach((p, i) => {
          const total = totalResourceCards(p);
          if (total >= DISCARD_THRESHOLD) state.pendingDiscards[i] = Math.floor(total / 2);
        });
        state.phase = Object.keys(state.pendingDiscards).length > 0 ? "discard" : "moveRobber";
      } else {
        produce(state, sum);
        state.phase = "main";
      }
      break;
    }

    // ------------------------------------------------------ robber (E1-05)
    case "discard": {
      requirePhase("discard");
      const required = state.pendingDiscards[playerIdx];
      assert(required !== undefined, "NO_DISCARD_DUE", "you have nothing to discard");
      assert(sumPartial(action.resources) === required, "DISCARD_COUNT", `must discard exactly ${required} cards`);
      assert(hasResources(me, action.resources), "INSUFFICIENT", "you don't hold those cards");
      transferToBank(state, me, action.resources);
      delete state.pendingDiscards[playerIdx];
      if (Object.keys(state.pendingDiscards).length === 0) state.phase = "moveRobber";
      break;
    }
    case "moveRobber": {
      requirePhase("moveRobber");
      requireTurn();
      assert(state.board.tiles.some((t) => t.id === action.tile), "BAD_TILE", "unknown tile");
      assert(action.tile !== state.board.robberTile, "ROBBER_STAY", "robber must move to a different tile");
      state.board.robberTile = action.tile;
      state.log.push(`robber moved to ${action.tile}`);
      state.phase = robberVictims(state).length > 0 ? "steal" : "main";
      break;
    }
    case "steal": {
      requirePhase("steal");
      requireTurn();
      assert(robberVictims(state).includes(action.target), "BAD_TARGET", "target is not adjacent to the robber (or has no cards)");
      stealRandomCard(state, action.target, playerIdx);
      state.phase = "main";
      break;
    }

    // ------------------------------------------------------ build (E1-06)
    case "buildRoad": {
      requirePhase("main");
      requireTurn();
      assert(state.board.edgeVertices[action.edge], "BAD_EDGE", "unknown edge");
      assert(state.roadOwner[action.edge] === undefined, "OCCUPIED", "edge taken");
      assert(me.piecesLeft.roads > 0, "NO_PIECES", "no road pieces left");
      assert(roadConnected(state, playerIdx, action.edge), "NOT_CONNECTED", "road must connect to your network");
      if (state.pendingFreeRoads > 0) {
        state.pendingFreeRoads--;
      } else {
        assert(hasResources(me, COSTS.road), "CANT_AFFORD", "road costs 1 wood + 1 brick");
        transferToBank(state, me, COSTS.road);
      }
      me.roads.push(action.edge);
      me.piecesLeft.roads--;
      state.roadOwner[action.edge] = playerIdx;
      updateLongestRoad(state);
      break;
    }
    case "buildSettlement": {
      requirePhase("main");
      requireTurn();
      assert(state.board.vertexTiles[action.vertex], "BAD_VERTEX", "unknown vertex");
      assert(me.piecesLeft.settlements > 0, "NO_PIECES", "no settlement pieces left");
      assert(settlementSpotFree(state, action.vertex), "DISTANCE_RULE", "too close to another settlement");
      assert(
        state.board.vertexEdges[action.vertex].some((e) => state.roadOwner[e] === playerIdx),
        "NOT_CONNECTED", "settlement must touch one of your roads",
      );
      assert(hasResources(me, COSTS.settlement), "CANT_AFFORD", "settlement costs wood+brick+wheat+sheep");
      transferToBank(state, me, COSTS.settlement);
      me.settlements.push(action.vertex);
      me.piecesLeft.settlements--;
      placeBuildingCaches(state, playerIdx, action.vertex, "settlement");
      updateLongestRoad(state); // a new settlement can break an opponent's road
      break;
    }
    case "buildCity": {
      requirePhase("main");
      requireTurn();
      assert(me.settlements.includes(action.vertex), "NO_SETTLEMENT", "you need a settlement here to upgrade");
      assert(me.piecesLeft.cities > 0, "NO_PIECES", "no city pieces left");
      assert(hasResources(me, COSTS.city), "CANT_AFFORD", "city costs 2 wheat + 3 ore");
      transferToBank(state, me, COSTS.city);
      me.settlements = me.settlements.filter((v) => v !== action.vertex);
      me.cities.push(action.vertex);
      me.piecesLeft.settlements++; // the settlement piece returns to your stock
      me.piecesLeft.cities--;
      placeBuildingCaches(state, playerIdx, action.vertex, "city");
      break;
    }

    // ------------------------------------------------------ dev cards (E1-08)
    case "buyDevCard": {
      requirePhase("main");
      requireTurn();
      assert(state.devDeck.length > 0, "DECK_EMPTY", "dev card deck is empty");
      assert(hasResources(me, COSTS.devCard), "CANT_AFFORD", "dev card costs wheat+sheep+ore");
      transferToBank(state, me, COSTS.devCard);
      const card = state.devDeck.pop()!;
      me.devCards.push({ type: card, boughtOnTurn: state.turn });
      break;
    }
    case "playDevCard": {
      requirePhase("main");
      requireTurn();
      assert(!state.playedDevThisTurn, "ONE_DEV_PER_TURN", "only one dev card per turn");
      const idx = me.devCards.findIndex(
        (c) => c.type === action.card && c.boughtOnTurn < state.turn,
      );
      assert(idx >= 0, "NO_CARD", `no playable ${action.card} (VP cards are never played; cards can't be played the turn they're bought)`);
      me.devCards.splice(idx, 1);
      state.playedDevThisTurn = true;
      switch (action.card) {
        case "knight":
          me.playedKnights++;
          updateLargestArmy(state, playerIdx);
          state.phase = "moveRobber";
          break;
        case "roadBuilding":
          state.pendingFreeRoads = Math.min(2, me.piecesLeft.roads);
          break;
        case "yearOfPlenty": {
          assert(action.resources, "PARAMS", "yearOfPlenty needs two resources");
          for (const r of action.resources) {
            assert(state.bank[r] > 0, "BANK_EMPTY", `bank has no ${r}`);
            grantFromBank(state, me, r, 1);
          }
          break;
        }
        case "monopoly": {
          assert(action.resource, "PARAMS", "monopoly needs a resource");
          let taken = 0;
          state.players.forEach((p, i) => {
            if (i === playerIdx) return;
            taken += p.resources[action.resource!];
            p.resources[action.resource!] = 0;
          });
          me.resources[action.resource] += taken;
          state.log.push(`P${playerIdx} monopolized ${taken} ${action.resource}`);
          break;
        }
      }
      break;
    }

    // ------------------------------------------------------ trading (E1-07)
    case "bankTrade": {
      requirePhase("main");
      requireTurn();
      assert(action.give !== action.want, "SAME_RESOURCE", "pick two different resources");
      const ratio = bankTradeRatio(state, playerIdx, action.give);
      assert(me.resources[action.give] >= ratio, "CANT_AFFORD", `${ratio}:1 — you need ${ratio} ${action.give}`);
      assert(state.bank[action.want] > 0, "BANK_EMPTY", `bank has no ${action.want}`);
      transferToBank(state, me, { [action.give]: ratio });
      grantFromBank(state, me, action.want, 1);
      state.log.push(`P${playerIdx} bank-traded ${ratio} ${action.give} for 1 ${action.want}`);
      break;
    }
    case "offerTrade": {
      requirePhase("main");
      requireTurn();
      assert(sumPartial(action.give) > 0 && sumPartial(action.want) > 0, "EMPTY_TRADE", "both sides of a trade need cards");
      assert(hasResources(me, action.give), "INSUFFICIENT", "you don't hold what you're offering");
      state.tradeOffer = { from: playerIdx, give: action.give, want: action.want };
      break;
    }
    case "acceptTrade": {
      requirePhase("main");
      const offer = state.tradeOffer;
      assert(offer, "NO_OFFER", "no open trade offer");
      assert(playerIdx !== offer.from, "OWN_OFFER", "you can't accept your own offer");
      const offerer = state.players[offer.from];
      assert(hasResources(me, offer.want), "INSUFFICIENT", "you don't hold what the offerer wants");
      assert(hasResources(offerer, offer.give), "INSUFFICIENT", "offerer no longer holds the offered cards");
      for (const r of RESOURCES) {
        const giveAmt = offer.give[r] ?? 0; // offerer -> acceptor
        const wantAmt = offer.want[r] ?? 0; // acceptor -> offerer
        offerer.resources[r] += wantAmt - giveAmt;
        me.resources[r] += giveAmt - wantAmt;
      }
      state.log.push(`P${playerIdx} accepted P${offer.from}'s trade`);
      state.tradeOffer = null;
      break;
    }
    case "cancelTrade": {
      requirePhase("main");
      assert(state.tradeOffer, "NO_OFFER", "no open trade offer");
      assert(playerIdx === state.tradeOffer.from || playerIdx === state.currentPlayer, "NOT_YOURS", "only the offerer can cancel");
      state.tradeOffer = null;
      break;
    }

    // ------------------------------------------------------ end turn
    case "endTurn": {
      requirePhase("main");
      requireTurn();
      state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
      state.turn++;
      state.phase = "roll";
      state.dice = null;
      state.playedDevThisTurn = false;
      state.pendingFreeRoads = 0;
      state.tradeOffer = null;
      break;
    }

    default: {
      const never: never = action;
      throw new RulesError("UNKNOWN_ACTION", `unknown action ${(never as Action).type}`);
    }
  }

  checkWin(state);
  return state;
}
