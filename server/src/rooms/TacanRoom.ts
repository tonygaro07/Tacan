// ---------------------------------------------------------------------------
// E2-01 — TacanRoom: authoritative multiplayer room
// E2-02 — short join codes (5 letters, no I/O to avoid misreads)
// E2-04 — every client message is validated by the rules engine before
//          anything changes; illegal intents bounce back as error messages
// E2-05 — reconnection: a disconnected player's seat is reserved by name;
//          rejoining with the room code + same name restores it
//
// The client is a dumb renderer: it sends { type: "action", ... } intents and
// receives redacted "state" snapshots. All game logic lives in @tacan/rules.
// ---------------------------------------------------------------------------
// colyseus ships CJS; Node's ESM loader can't statically see its named
// exports (works in vitest's transformer, breaks under plain `tsx`/node).
// createRequire is the interop-safe way to load it in both worlds.
import { createRequire } from "node:module";
import type { Client } from "colyseus";
const { Room, ServerError } = createRequire(import.meta.url)("colyseus") as typeof import("colyseus");
import { Action, applyAction, createGame, GameState, RulesError, victoryPoints } from "@tacan/rules";
import { redactStateFor } from "../view.js";

export interface CreateOptions {
  seed?: number;            // fixed seed (tests/replays); random otherwise
  allowForcedDice?: boolean; // test-only escape hatch, never set in production
}
interface JoinOptions {
  name?: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O — friends read these aloud

export class TacanRoom extends Room {
  maxClients = 6;

  private game: GameState | null = null;
  private lobby: { sessionId: string; name: string }[] = [];
  private seats = new Map<string, number>();          // sessionId -> seat
  private disconnectedSeats = new Map<string, number>(); // name -> reserved seat
  // E3-02: cosmetic avatar claims, keyed by NAME so they survive reconnection.
  private avatarByName = new Map<string, string>();
  private seatAvatars: (string | null)[] = [];
  private opts: CreateOptions = {};

  onCreate(options: CreateOptions = {}) {
    this.opts = options;
    let code = "";
    for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    this.roomId = code; // E2-02: the room code IS the room id -> joinById(code)

    this.onMessage("start", (client) => this.handleStart(client));
    this.onMessage("action", (client, action: Action) => this.handleAction(client, action));
    this.onMessage("avatar", (client, msg: { id?: string }) => this.handleAvatar(client, msg));
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const name = options.name?.trim();
    if (!name) throw new ServerError(400, "NAME_REQUIRED");

    if (this.game) {
      // E2-05: mid-game joins are only seat reclaims
      const seat = this.disconnectedSeats.get(name);
      if (seat === undefined) throw new ServerError(403, "GAME_IN_PROGRESS");
      this.disconnectedSeats.delete(name);
      this.seats.set(client.sessionId, seat);
      client.send("state", { ...redactStateFor(this.game, seat), avatars: this.seatAvatars });
      this.broadcast("playerReconnected", { seat, name }, { except: client });
      return;
    }

    if (this.lobby.some((p) => p.name === name)) throw new ServerError(409, "NAME_TAKEN");
    this.lobby.push({ sessionId: client.sessionId, name });
    this.broadcastLobby();
  }

  onLeave(client: Client) {
    if (this.game) {
      const seat = this.seats.get(client.sessionId);
      this.seats.delete(client.sessionId);
      if (seat !== undefined) {
        this.disconnectedSeats.set(this.game.players[seat].name, seat);
        this.broadcast("playerDisconnected", { seat });
      }
    } else {
      this.lobby = this.lobby.filter((p) => p.sessionId !== client.sessionId);
      this.broadcastLobby(); // host is always lobby[0]; leaving host passes it on
    }
  }

  private broadcastLobby() {
    this.broadcast("lobby", {
      code: this.roomId,
      players: this.lobby.map((p) => p.name),
      host: this.lobby[0]?.name ?? null,
      avatars: Object.fromEntries(this.avatarByName), // name -> character id
    });
  }

  // E3-02 — claim/switch a character. Cosmetic only; uniqueness enforced here.
  private handleAvatar(client: Client, msg: { id?: string }) {
    if (this.game)
      return client.send("error", { code: "ALREADY_STARTED", message: "pick characters in the lobby" });
    const name = this.lobby.find((p) => p.sessionId === client.sessionId)?.name;
    if (!name) return;
    const id = msg?.id;
    if (!id || typeof id !== "string" || id.length > 24)
      return client.send("error", { code: "BAD_AVATAR", message: "invalid character id" });
    const takenBy = [...this.avatarByName.entries()].find(([, a]) => a === id)?.[0];
    if (takenBy && takenBy !== name)
      return client.send("error", { code: "AVATAR_TAKEN", message: `${takenBy} already picked that character` });
    this.avatarByName.set(name, id);
    this.broadcastLobby();
  }

  private handleStart(client: Client) {
    if (this.game)
      return client.send("error", { code: "ALREADY_STARTED", message: "game already started" });
    if (client.sessionId !== this.lobby[0]?.sessionId)
      return client.send("error", { code: "NOT_HOST", message: "only the host can start" });
    if (this.lobby.length < 3)
      return client.send("error", { code: "NEED_PLAYERS", message: "Tacan needs 3-6 players" });

    const seed = this.opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.game = createGame({ playerNames: this.lobby.map((p) => p.name), seed });
    this.lobby.forEach((p, seat) => this.seats.set(p.sessionId, seat));
    this.seatAvatars = this.lobby.map((p) => this.avatarByName.get(p.name) ?? null);
    this.broadcastViews();
  }

  private handleAction(client: Client, action: Action) {
    if (!this.game)
      return client.send("error", { code: "NOT_STARTED", message: "game hasn't started" });
    const seat = this.seats.get(client.sessionId);
    if (seat === undefined)
      return client.send("error", { code: "NO_SEAT", message: "you're not seated in this game" });
    // E2-04: never trust client dice
    if (action?.type === "roll" && action.forced && !this.opts.allowForcedDice)
      return client.send("error", { code: "FORGED_DICE", message: "dice are rolled by the server" });

    try {
      this.game = applyAction(this.game, seat, action); // the whole rulebook, enforced
    } catch (err) {
      if (err instanceof RulesError)
        return client.send("error", { code: err.code, message: err.message });
      throw err;
    }
    this.broadcastViews();
    if (this.game.winner !== null) {
      // E7-01: game over reveals everything — final scores include hidden VP cards
      const finalScores = this.game.players.map((_, i) => victoryPoints(this.game!, i, true));
      this.broadcast("gameOver", { winner: this.game.winner, finalScores });
    }
  }

  private broadcastViews() {
    if (!this.game) return;
    for (const c of this.clients) {
      const seat = this.seats.get(c.sessionId);
      if (seat !== undefined) c.send("state", { ...redactStateFor(this.game, seat), avatars: this.seatAvatars });
    }
  }
}
