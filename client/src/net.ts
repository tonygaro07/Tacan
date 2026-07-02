// ---------------------------------------------------------------------------
// Network layer: colyseus.js wiring. The client only ever
//   * sends "start" and "action" (intents)
//   * receives "lobby" / "state" / "error" / "gameOver" (authoritative facts)
// ---------------------------------------------------------------------------
import { Client, Room } from "colyseus.js";
import type { Action } from "@tacan/rules";
import { useStore } from "./store";

let endpointOverride: string | null = null;
let room: Room | null = null;

/** Tests point this at the in-process test server. */
export function setEndpoint(url: string): void {
  endpointOverride = url;
}

export function getEndpoint(): string {
  return endpoint();
}

function endpoint(): string {
  if (endpointOverride) return endpointOverride;
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    if (env?.VITE_SERVER_URL) return env.VITE_SERVER_URL;
  } catch {
    /* not running under Vite */
  }
  return "ws://localhost:2567";
}

function wire(r: Room): void {
  room = r;
  const store = () => useStore.getState();

  r.onMessage("lobby", (m) => useStore.setState({ lobby: m, code: m.code, screen: "lobby" }));
  r.onMessage("state", (m) =>
    useStore.setState((s) => ({ view: m, code: r.roomId, screen: s.gameOver ? "gameover" : "game" })),
  );
  r.onMessage("error", (m: { code: string; message: string }) => store().pushError(`${m.code}: ${m.message}`));
  r.onMessage("gameOver", (m) => useStore.setState({ gameOver: m, screen: "gameover" }));
  r.onMessage("playerDisconnected", (m: { seat: number }) => {
    const v = store().view;
    if (v) store().pushError(`${v.players[m.seat]?.name ?? "someone"} disconnected — they can rejoin with the room code`);
  });
  r.onMessage("playerReconnected", (m: { name: string }) => store().pushError(`${m.name} reconnected`));
  r.onLeave(() => {
    room = null;
  });
}

export async function createRoom(name: string): Promise<void> {
  const c = new Client(endpoint());
  wire(await c.create("tacan", { name }));
}

export async function joinRoom(code: string, name: string): Promise<void> {
  const c = new Client(endpoint());
  wire(await c.joinById(code.trim().toUpperCase(), { name }));
}

export function sendStart(): void {
  room?.send("start");
}

export function sendAvatar(id: string): void {
  room?.send("avatar", { id });
}

export function sendAction(action: Action): void {
  room?.send("action", action);
}

export async function leaveRoom(): Promise<void> {
  await room?.leave();
  room = null;
  useStore.getState().reset();
}
