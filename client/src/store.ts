// Client state — a thin mirror of whatever the server last broadcast (§4 of
// the masterplan: the client never computes game logic, it renders state).
import { create } from "zustand";
import type { ClientView } from "@tacan/server/view";

export type BuildMode = "road" | "settlement" | "city" | null;
export type Screen = "landing" | "lobby" | "game" | "gameover";

export interface LobbyInfo {
  code: string;
  players: string[];
  host: string | null;
  avatars: Record<string, string>; // player name -> character id
}

export interface GameOverInfo {
  winner: number;
  finalScores: number[];
}

interface Store {
  screen: Screen;
  name: string;
  code: string | null;
  lobby: LobbyInfo | null;
  view: (ClientView & { avatars?: (string | null)[] }) | null;
  gameOver: GameOverInfo | null;
  errors: string[];
  mode: BuildMode;
  busy: boolean;
  setName: (name: string) => void;
  setMode: (mode: BuildMode) => void;
  setBusy: (busy: boolean) => void;
  pushError: (msg: string) => void;
  reset: () => void;
}

export const useStore = create<Store>((set) => ({
  screen: "landing",
  name: "",
  code: null,
  lobby: null,
  view: null,
  gameOver: null,
  errors: [],
  mode: null,
  busy: false,
  setName: (name) => set({ name }),
  setMode: (mode) => set((s) => ({ mode: s.mode === mode ? null : mode })),
  setBusy: (busy) => set({ busy }),
  pushError: (msg) => {
    set((s) => ({ errors: [...s.errors, msg].slice(-4) }));
    setTimeout(() => set((s) => ({ errors: s.errors.slice(1) })), 4500);
  },
  reset: () =>
    set({ screen: "landing", code: null, lobby: null, view: null, gameOver: null, mode: null, busy: false }),
}));
