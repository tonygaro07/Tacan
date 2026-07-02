// Test bots: spawn 2 bots via the UI code path, host plays only her own moves,
// bots must autonomously complete their share of the snake draft.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boot, ColyseusTestServer } from "@colyseus/testing";
import appConfig from "@tacan/server/app.config";
import { spawnBots, dismissBots, activeBotCount } from "../src/bots";
import { createRoom, sendAction, sendStart, setEndpoint } from "../src/net";
import { useStore } from "../src/store";

let colyseus: ColyseusTestServer;
const PORT = 2572;

beforeAll(async () => {
  colyseus = await boot(appConfig, PORT);
  setEndpoint(`ws://127.0.0.1:${PORT}`);
});
afterAll(async () => {
  await dismissBots();
  await colyseus.shutdown();
});

async function until(cond: () => boolean, ms = 15000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 25));
  }
}
const store = () => useStore.getState();

describe("simulate-players bots", () => {
  it("bots join, auto-play their setup turns, and hand the game back to the host", async () => {
    useStore.setState({ name: "Ana" });
    await createRoom("Ana");
    await until(() => !!store().code);

    await spawnBots(store().code!, 2);
    await until(() => store().lobby?.players.length === 3);
    expect(store().lobby!.players).toEqual(["Ana", "Bot-1", "Bot-2"]);
    expect(activeBotCount()).toBe(2);

    sendStart();
    await until(() => store().view?.phase === "setup");

    // Ana (seat 0) places her first settlement + road...
    const v0 = store().view!;
    const vertex = v0.board.vertices[0];
    sendAction({ type: "placeSetupSettlement", vertex });
    await until(() => store().view!.awaitingSetupRoad === true);
    sendAction({ type: "placeSetupRoad", edge: store().view!.board.vertexEdges[vertex][0] });

    // ...then bots 1,2,2,1 must play FOUR placement pairs on their own (snake draft)
    await until(() => store().view!.currentPlayer === 0 && store().view!.setupIndex === 5, 20000);
    // snake order [0,1,2,2,1,0]: positions 1-4 are the bots' — both fully placed
    const v1 = store().view!;
    expect(v1.players[1].settlements).toHaveLength(2);
    expect(v1.players[2].settlements).toHaveLength(2);
    expect(v1.players[1].roads).toHaveLength(2);
    expect(v1.players[2].roads).toHaveLength(2);

    // Ana finishes setup; game must enter the roll phase on her turn
    const v = store().view!;
    const spot = v.board.vertices.find(
      (x: string) => !v.buildings[x] && v.board.vertexNeighbors[x].every((n: string) => !v.buildings[n]),
    )!;
    sendAction({ type: "placeSetupSettlement", vertex: spot });
    await until(() => store().view!.awaitingSetupRoad === true);
    sendAction({ type: "placeSetupRoad", edge: store().view!.board.vertexEdges[spot].find((e: string) => store().view!.roadOwner[e] === undefined)! });
    await until(() => store().view!.phase === "roll" && store().view!.currentPlayer === 0, 20000);
  }, 60000);
});
