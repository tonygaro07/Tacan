// E3-02 acceptance tests — avatar claims: unique, lobby-broadcast, seat-mapped,
// reconnect-safe, and 100% cosmetic (the rules engine never sees them).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, ColyseusTestServer } from "@colyseus/testing";
import type { Room as ClientRoom } from "colyseus.js";
import appConfig from "../src/app.config.js";

let colyseus: ColyseusTestServer;
beforeAll(async () => { colyseus = await boot(appConfig); });
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

type Msg = { type: string; payload: any };
function collect(room: ClientRoom): Msg[] {
  const msgs: Msg[] = [];
  room.onMessage("*", (type, payload) => msgs.push({ type: String(type), payload }));
  return msgs;
}
const last = (msgs: Msg[], type: string) => [...msgs].reverse().find((m) => m.type === type)?.payload;
async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe("E3-02 avatar claims", () => {
  it("claims broadcast to the lobby; duplicates are rejected; switching is allowed", async () => {
    const room = await colyseus.createRoom("tacan", { seed: 7 });
    const ana = await colyseus.connectTo(room, { name: "Ana" });
    const beto = await colyseus.connectTo(room, { name: "Beto" });
    const caro = await colyseus.connectTo(room, { name: "Caro" });
    const [ia, ib, ic] = [collect(ana), collect(beto), collect(caro)];

    ana.send("avatar", { id: "karo" });
    await until(() => last(ic, "lobby")?.avatars?.Ana === "karo");

    // Beto tries to grab Karo too — rejected
    beto.send("avatar", { id: "karo" });
    await until(() => last(ib, "error") !== undefined);
    expect(last(ib, "error").code).toBe("AVATAR_TAKEN");

    // Beto takes Lexx instead; Ana switches to Arctic (frees Karo)
    beto.send("avatar", { id: "lexx" });
    ana.send("avatar", { id: "arctic" });
    caro.send("avatar", { id: "ricardo" });
    await until(() => {
      const a = last(ic, "lobby")?.avatars;
      return a?.Ana === "arctic" && a?.Beto === "lexx" && a?.Caro === "ricardo";
    });

    // start: avatars ride along with every state broadcast, seat-aligned
    ana.send("start");
    await until(() => last(ia, "state") !== undefined);
    expect(last(ia, "state").avatars).toEqual(["arctic", "lexx", "ricardo"]);
    // and the rules engine itself knows nothing about avatars (pure cosmetics)
    expect(last(ia, "state").players[0].avatar).toBeUndefined();
  });

  it("avatars survive reconnection (name-keyed, not session-keyed)", async () => {
    const room = await colyseus.createRoom("tacan", { seed: 8 });
    const ana = await colyseus.connectTo(room, { name: "Ana" });
    const beto = await colyseus.connectTo(room, { name: "Beto" });
    await colyseus.connectTo(room, { name: "Caro" });
    const ia = collect(ana);
    beto.send("avatar", { id: "teo" });
    await until(() => last(ia, "lobby")?.avatars?.Beto === "teo");
    ana.send("start");
    await until(() => last(ia, "state") !== undefined);

    await beto.leave();
    await until(() => last(ia, "playerDisconnected") !== undefined);
    const back = await colyseus.sdk.joinById(room.roomId, { name: "Beto" });
    const ibk = collect(back);
    await until(() => last(ibk, "state") !== undefined);
    expect(last(ibk, "state").avatars).toEqual([null, "teo", null]);
    expect(last(ibk, "state").yourSeat).toBe(1);
  });

  it("claims are lobby-only once the game starts", async () => {
    const room = await colyseus.createRoom("tacan", { seed: 9 });
    const ana = await colyseus.connectTo(room, { name: "Ana" });
    await colyseus.connectTo(room, { name: "Beto" });
    await colyseus.connectTo(room, { name: "Caro" });
    const ia = collect(ana);
    ana.send("start");
    await until(() => last(ia, "state") !== undefined);
    ana.send("avatar", { id: "karo" });
    await until(() => last(ia, "error") !== undefined);
    expect(last(ia, "error").code).toBe("ALREADY_STARTED");
  });
});
