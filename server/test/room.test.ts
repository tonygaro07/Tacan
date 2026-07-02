// ---------------------------------------------------------------------------
// Epic 2 acceptance tests — real Colyseus server, real websocket clients.
// E2-01 scaffold · E2-02 join by code · E2-03 redacted state bridge ·
// E2-04 server-side validation · E2-05 reconnection
// ---------------------------------------------------------------------------
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "colyseus.js";
import appConfig from "../src/app.config.js";

let colyseus: ColyseusTestServer;

beforeAll(async () => { colyseus = await boot(appConfig); });
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

type Msg = { type: string; payload: any };

/** Attach a message collector to a client room. */
function collect(room: ClientRoom): Msg[] {
  const msgs: Msg[] = [];
  room.onMessage("*", (type, payload) => msgs.push({ type: String(type), payload }));
  return msgs;
}

const last = (msgs: Msg[], type: string) =>
  [...msgs].reverse().find((m) => m.type === type)?.payload;

async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 15));
  }
}

/** Boot a room, join n named players, return everything wired with collectors. */
async function lobbyOf(n: number, opts: Record<string, unknown> = {}) {
  const room = await colyseus.createRoom("tacan", { seed: 4242, ...opts });
  const names = ["Ana", "Beto", "Caro", "Dani", "Eli", "Fede"].slice(0, n);
  const clients: ClientRoom[] = [];
  const inboxes: Msg[][] = [];
  for (const name of names) {
    const c = await colyseus.connectTo(room, { name });
    inboxes.push(collect(c));
    clients.push(c);
  }
  return { room, clients, inboxes, names };
}

describe("E2-01 room scaffold", () => {
  it("boots a tacan room and seats players in a lobby", async () => {
    const { inboxes, names } = await lobbyOf(3);
    await until(() => last(inboxes[2], "lobby")?.players?.length === 3);
    const lobby = last(inboxes[2], "lobby");
    expect(lobby.players).toEqual(names);
    expect(lobby.host).toBe("Ana");
  });

  it("only the host can start, and only with 3+ players", async () => {
    const { clients, inboxes } = await lobbyOf(3);
    clients[1].send("start");
    await until(() => last(inboxes[1], "error") !== undefined);
    expect(last(inboxes[1], "error").code).toBe("NOT_HOST");
    clients[0].send("start");
    await until(() => last(inboxes[0], "state") !== undefined);
    expect(last(inboxes[0], "state").phase).toBe("setup");
  });
});

describe("E2-02 join by short code", () => {
  it("assigns a 5-letter code and lets a client join with it", async () => {
    const { room } = await lobbyOf(1);
    expect(room.roomId).toMatch(/^[A-HJ-NP-Z]{5}$/); // no I or O
    const joiner = await colyseus.sdk.joinById(room.roomId, { name: "Beto" });
    const inbox = collect(joiner);
    await until(() => last(inbox, "lobby")?.players?.length === 2);
    expect(last(inbox, "lobby").players).toContain("Beto");
  });

  it("rejects duplicate names and joins to games already in progress", async () => {
    const { room, clients, inboxes } = await lobbyOf(3);
    await expect(colyseus.sdk.joinById(room.roomId, { name: "Ana" })).rejects.toThrow();
    clients[0].send("start");
    await until(() => last(inboxes[0], "state") !== undefined); // game is live
    await expect(colyseus.sdk.joinById(room.roomId, { name: "Zoe" })).rejects.toThrow();
  });
});

describe("E2-03 state bridge with redaction", () => {
  it("sends each player a personalized view; hidden info stays hidden", async () => {
    const { clients, inboxes } = await lobbyOf(3);
    clients[0].send("start");
    await until(() => inboxes.every((inbox) => last(inbox, "state") !== undefined));

    inboxes.forEach((inbox, seat) => {
      const view = last(inbox, "state");
      expect(view.yourSeat).toBe(seat);
      expect(view.phase).toBe("setup");
      // secrets never leave the server
      expect(view.seed).toBeUndefined();
      expect(view.devDeck).toBeUndefined();
      expect(view.devDeckCount).toBe(25);
      // own hand is real; opponents are counts only
      expect(view.players[seat].resources).not.toBeNull();
      view.players.forEach((p: any, i: number) => {
        if (i !== seat) {
          expect(p.resources).toBeNull();
          expect(p.devCards).toBeNull();
          expect(typeof p.resourceCount).toBe("number");
        }
      });
      // public board data is shared by everyone
      expect(view.board.tiles).toHaveLength(19);
    });
  });

  it("every legal action triggers a fresh broadcast to all seats", async () => {
    const { clients, inboxes } = await lobbyOf(3);
    clients[0].send("start");
    await until(() => last(inboxes[0], "state") !== undefined);
    const v0 = last(inboxes[0], "state");
    const vertex = v0.board.vertices[0];
    const countsBefore = inboxes.map((inbox) => inbox.filter((m) => m.type === "state").length);

    clients[0].send("action", { type: "placeSetupSettlement", vertex });
    await until(() =>
      inboxes.every((inbox, i) => inbox.filter((m) => m.type === "state").length > countsBefore[i]),
    );
    const v1 = last(inboxes[2], "state");
    expect(v1.buildings[vertex]).toEqual({ player: 0, type: "settlement" });
    expect(v1.awaitingSetupRoad).toBe(true);
  });
});

describe("E2-04 server-side validation", () => {
  it("bounces out-of-turn and illegal actions with the engine's error code", async () => {
    const { clients, inboxes } = await lobbyOf(3);
    clients[0].send("start");
    await until(() => last(inboxes[1], "state") !== undefined);
    const statesSoFar = inboxes[1].filter((m) => m.type === "state").length;

    // player 1 tries to act on player 0's setup turn
    clients[1].send("action", { type: "placeSetupSettlement", vertex: "nope" });
    await until(() => last(inboxes[1], "error") !== undefined);
    expect(last(inboxes[1], "error").code).toBe("NOT_YOUR_TURN");

    // current player, but illegal phase for rolling
    clients[0].send("action", { type: "roll" });
    await until(() => last(inboxes[0], "error") !== undefined);
    expect(last(inboxes[0], "error").code).toBe("WRONG_PHASE");

    // rejected intents change nothing and broadcast nothing
    expect(inboxes[1].filter((m) => m.type === "state").length).toBe(statesSoFar);
  });

  it("blocks forged dice unless the room explicitly allows them", async () => {
    const { clients, inboxes } = await lobbyOf(3, { allowForcedDice: false });
    clients[0].send("start");
    await until(() => last(inboxes[0], "state") !== undefined);
    clients[0].send("action", { type: "roll", forced: [6, 6] });
    await until(() => last(inboxes[0], "error") !== undefined);
    expect(last(inboxes[0], "error").code).toBe("FORGED_DICE");
  });

  it("actions from a client that never joined the game are refused", async () => {
    const { room, clients, inboxes } = await lobbyOf(3);
    clients[0].send("start");
    await until(() => last(inboxes[0], "state") !== undefined);
    // a 4th client can't even get in (game in progress) — proven in E2-02;
    // here: a seated client can't act for another seat because seat comes
    // from the server's session map, never from the message payload
    clients[2].send("action", { type: "placeSetupSettlement", vertex: last(inboxes[0], "state").board.vertices[0] });
    await until(() => last(inboxes[2], "error") !== undefined);
    expect(last(inboxes[2], "error").code).toBe("NOT_YOUR_TURN");
    expect(room.roomId).toBeDefined();
  });
});

describe("E2-05 reconnection", () => {
  it("a disconnected player rejoins by code + name and gets their seat back", async () => {
    const { room, clients, inboxes } = await lobbyOf(3);
    clients[0].send("start");
    await until(() => last(inboxes[1], "state") !== undefined);

    // Beto (seat 1) drops
    await clients[1].leave();
    await until(() => last(inboxes[0], "playerDisconnected") !== undefined);
    expect(last(inboxes[0], "playerDisconnected").seat).toBe(1);

    // Beto comes back with the room code and his name
    const back = await colyseus.sdk.joinById(room.roomId, { name: "Beto" });
    const backInbox = collect(back);
    await until(() => last(backInbox, "state") !== undefined);
    expect(last(backInbox, "state").yourSeat).toBe(1);

    // and the game continues: player 0 places a settlement, Beto sees it
    const view = last(inboxes[0], "state");
    const vertex = view.board.vertices[0];
    clients[0].send("action", { type: "placeSetupSettlement", vertex });
    await until(() => last(backInbox, "state")?.buildings?.[vertex] !== undefined);
    expect(last(backInbox, "state").buildings[vertex]).toEqual({ player: 0, type: "settlement" });

    // an impostor name still can't get in
    await expect(colyseus.sdk.joinById(room.roomId, { name: "Hacker" })).rejects.toThrow();
  });
});
