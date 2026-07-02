// ---------------------------------------------------------------------------
// End-to-end: the REAL client net/store code against the REAL server over a
// real websocket. Ana runs on our net.ts; Beto & Caro are raw colyseus.js
// clients standing in for two more browsers.
// ---------------------------------------------------------------------------
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, ColyseusTestServer } from "@colyseus/testing";
import { Client, Room } from "colyseus.js";
import appConfig from "@tacan/server/app.config";
import { createRoom, sendAction, sendStart, setEndpoint } from "../src/net";
import { useStore } from "../src/store";

let colyseus: ColyseusTestServer;
const PORT = 2571;

beforeAll(async () => {
  colyseus = await boot(appConfig, PORT);
  setEndpoint(`ws://127.0.0.1:${PORT}`);
});
afterAll(async () => {
  await colyseus.shutdown();
});

async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}
const store = () => useStore.getState();

describe("client ↔ server integration", () => {
  let beto: Room;
  let caro: Room;
  const betoInbox: Record<string, any> = {};

  it("creates a room through the UI store and friends join by code", async () => {
    useStore.setState({ name: "Ana" });
    await createRoom("Ana");
    await until(() => store().screen === "lobby" && !!store().code);
    const code = store().code!;
    expect(code).toMatch(/^[A-HJ-NP-Z]{5}$/);

    const sdk = new Client(`ws://127.0.0.1:${PORT}`);
    beto = await sdk.joinById(code, { name: "Beto" });
    caro = await sdk.joinById(code, { name: "Caro" });
    beto.onMessage("*", (type, payload) => (betoInbox[String(type)] = payload));
    await until(() => store().lobby?.players.length === 3);
    expect(store().lobby!.players).toEqual(["Ana", "Beto", "Caro"]);
    expect(store().lobby!.host).toBe("Ana");
  });

  it("host starts; everyone lands in the setup phase with a redacted view", async () => {
    sendStart();
    await until(() => store().screen === "game" && store().view?.phase === "setup");
    const v = store().view!;
    expect(v.yourSeat).toBe(0);
    expect(v.currentPlayer).toBe(0);
    expect((v as any).seed).toBeUndefined();
    await until(() => betoInbox.state?.yourSeat === 1);
  });

  it("UI intents flow through the reducer and come back as fresh state", async () => {
    const v = store().view!;
    const vertex = v.board.vertices[0];
    sendAction({ type: "placeSetupSettlement", vertex });
    await until(() => store().view!.awaitingSetupRoad === true);
    expect(store().view!.buildings[vertex]).toEqual({ player: 0, type: "settlement" });

    const edge = store().view!.board.vertexEdges[vertex][0];
    sendAction({ type: "placeSetupRoad", edge });
    await until(() => store().view!.currentPlayer === 1);
    // Beto's independent client saw the same public facts
    await until(() => betoInbox.state?.roadOwner?.[edge] === 0);
  });

  it("illegal intents bounce back as error toasts, state untouched", async () => {
    const before = store().view!;
    sendAction({ type: "placeSetupSettlement", vertex: before.board.vertices[20] }); // not Ana's turn
    await until(() => store().errors.some((e) => e.includes("NOT_YOUR_TURN")));
    expect(store().view).toBe(before); // no new broadcast for a rejected intent
    await beto.leave();
    await caro.leave();
  });
});
