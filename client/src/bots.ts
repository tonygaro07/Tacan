// ---------------------------------------------------------------------------
// Test bots — "simulate players" for solo testing.
// Each bot is a REAL colyseus.js client in this same browser tab: it joins by
// room code, receives its own redacted view, and auto-plays a greedy strategy
// (mirror of the E1-10 test bot). The server validates every bot move exactly
// like a human's — bots get no special treatment, which is the point:
// testing with them exercises the same code paths your friends will.
//
// Strategy for legality: build an ordered candidate list from the bot's view,
// send the first action, and advance to the next candidate on "error". The
// server is the referee; the bot never needs a full rules re-implementation.
// ---------------------------------------------------------------------------
import { Client, Room } from "colyseus.js";
import { RESOURCES, Resource } from "@tacan/rules";
import { getEndpoint } from "./net";

type View = Record<string, any>; // redacted server view (bot's own seat has real resources)

const ACT_DELAY_MS = 450; // slow enough to watch, fast enough to test

interface Bot {
  room: Room;
  name: string;
  view: View | null;
  candidates: unknown[];
  idx: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const bots: Bot[] = [];
export const activeBotCount = (): number => bots.length;

export async function spawnBots(code: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const name = `Bot-${bots.length + 1}`;
    const client = new Client(getEndpoint());
    const room = await client.joinById(code, { name });
    const bot: Bot = { room, name, view: null, candidates: [], idx: 0, timer: null };
    bots.push(bot);
    room.onMessage("state", (view: View) => {
      bot.view = view;
      bot.candidates = [];
      bot.idx = 0;
      schedule(bot);
    });
    room.onMessage("error", () => {
      // candidate rejected by the referee — try the next one
      bot.idx++;
      sendNext(bot);
    });
    room.onMessage("*", () => { /* lobby/gameOver/etc — no-op */ });
    room.onLeave(() => {
      const at = bots.indexOf(bot);
      if (at >= 0) bots.splice(at, 1);
    });
  }
}

export async function dismissBots(): Promise<void> {
  await Promise.all(bots.map((b) => b.room.leave()));
  bots.length = 0;
}

function schedule(bot: Bot): void {
  if (bot.timer) clearTimeout(bot.timer);
  bot.timer = setTimeout(() => act(bot), ACT_DELAY_MS);
}

function act(bot: Bot): void {
  const v = bot.view;
  if (!v || v.winner !== null) return;
  const me = v.yourSeat;
  const myDiscard = v.pendingDiscards?.[me] !== undefined;
  if (v.currentPlayer !== me && !myDiscard) return;
  bot.candidates = buildCandidates(v, me);
  bot.idx = 0;
  sendNext(bot);
}

function sendNext(bot: Bot): void {
  const action = bot.candidates[bot.idx];
  if (action) bot.room.send("action", action);
}

// --- greedy candidate list, ordered by value ---------------------------------
function buildCandidates(v: View, me: number): unknown[] {
  const my = v.players[me];
  const afford = (cost: Partial<Record<Resource, number>>) =>
    RESOURCES.every((r) => my.resources[r] >= (cost[r] ?? 0));
  const spotFree = (vertex: string) =>
    !v.buildings[vertex] && v.board.vertexNeighbors[vertex].every((n: string) => !v.buildings[n]);

  // discard has priority regardless of turn
  if (v.pendingDiscards?.[me] !== undefined) {
    const need = v.pendingDiscards[me];
    const dump: Partial<Record<Resource, number>> = {};
    let left = need;
    for (const r of RESOURCES) {
      const take = Math.min(my.resources[r], left);
      if (take > 0) { dump[r] = take; left -= take; }
    }
    return [{ type: "discard", resources: dump }];
  }

  switch (v.phase) {
    case "setup":
      if (!v.awaitingSetupRoad) {
        return v.board.vertices.filter(spotFree).slice(0, 30)
          .map((vertex: string) => ({ type: "placeSetupSettlement", vertex }));
      }
      return v.board.vertexEdges[v.lastSettlement]
        .filter((e: string) => v.roadOwner[e] === undefined)
        .map((edge: string) => ({ type: "placeSetupRoad", edge }));

    case "roll":
      return [{ type: "roll" }];

    case "moveRobber":
      return v.board.tiles
        .filter((t: View) => t.id !== v.board.robberTile)
        .slice(0, 5)
        .map((t: View) => ({ type: "moveRobber", tile: t.id }));

    case "steal": {
      const victims = new Set<number>();
      for (const vertex of v.board.tileVertices[v.board.robberTile]) {
        const b = v.buildings[vertex];
        if (b && b.player !== me && v.players[b.player].resourceCount > 0) victims.add(b.player);
      }
      return [...victims].map((target) => ({ type: "steal", target }));
    }

    case "main": {
      const out: unknown[] = [];
      if (my.piecesLeft.cities > 0 && afford({ wheat: 2, ore: 3 })) {
        out.push(...my.settlements.map((vertex: string) => ({ type: "buildCity", vertex })));
      }
      if (my.piecesLeft.settlements > 0 && afford({ wood: 1, brick: 1, wheat: 1, sheep: 1 })) {
        const nearMyRoads = v.board.vertices.filter(
          (vx: string) => spotFree(vx) && v.board.vertexEdges[vx].some((e: string) => v.roadOwner[e] === me),
        );
        out.push(...nearMyRoads.map((vertex: string) => ({ type: "buildSettlement", vertex })));
      }
      if (my.roads.length < 13 && afford({ wood: 1, brick: 1 })) {
        const frontier = v.board.edges.filter((e: string) => {
          if (v.roadOwner[e] !== undefined) return false;
          const [a, b] = v.board.edgeVertices[e];
          const touchesMe = (vx: string) =>
            v.buildings[vx]?.player === me ||
            v.board.vertexEdges[vx].some((x: string) => v.roadOwner[x] === me);
          return touchesMe(a) || touchesMe(b);
        });
        out.push(...frontier.slice(0, 10).map((edge: string) => ({ type: "buildRoad", edge })));
      }
      for (const give of RESOURCES) {
        if (my.resources[give] >= 4) {
          const want = [...RESOURCES].sort((a, b) => my.resources[a] - my.resources[b]).find((r) => r !== give)!;
          out.push({ type: "bankTrade", give, want });
          break;
        }
      }
      out.push({ type: "endTurn" });
      return out;
    }

    default:
      return [];
  }
}
