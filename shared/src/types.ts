// ---------------------------------------------------------------------------
// Tacan rules engine — core data models (E1-02)
// Pure data. No UI, no network. Server is the only authority (see masterplan §3).
// ---------------------------------------------------------------------------

export type Resource = "wood" | "brick" | "sheep" | "wheat" | "ore";
export const RESOURCES: Resource[] = ["wood", "brick", "sheep", "wheat", "ore"];

export type ResourceCount = Record<Resource, number>;
export const zeroResources = (): ResourceCount => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

export type DevCard = "knight" | "roadBuilding" | "yearOfPlenty" | "monopoly" | "victoryPoint";
export type PortType = "generic" | Resource; // generic = 3:1, resource = 2:1

export interface Tile {
  id: string;             // axial "q,r"
  q: number;
  r: number;
  resource: Resource | "desert";
  token: number | null;   // 2–12 (no 7), null on desert
}

export interface Port {
  id: string;
  type: PortType;
  vertices: [string, string]; // settle either vertex to gain the port
}

/**
 * Vertex IDs are the sorted triple of adjacent hex coords joined by "|"
 * (including off-board "virtual" hexes — every corner touches exactly 3 hexes
 * in the infinite grid, so this is canonical and collision-free).
 * Edge IDs are their two vertex IDs sorted and joined by "&".
 */
export interface Board {
  tiles: Tile[];
  ports: Port[];
  robberTile: string;
  vertices: string[];                                // 54
  edges: string[];                                   // 72
  vertexTiles: Record<string, string[]>;             // vertex -> on-board tile ids (1–3)
  tileVertices: Record<string, string[]>;            // tile -> 6 vertex ids
  edgeVertices: Record<string, [string, string]>;    // edge -> its 2 endpoints
  vertexEdges: Record<string, string[]>;             // vertex -> 2–3 incident edges
  vertexNeighbors: Record<string, string[]>;         // vertex -> adjacent vertices
}

export interface OwnedDevCard {
  type: DevCard;
  boughtOnTurn: number; // can't be played the turn it was bought
}

export interface Player {
  name: string;
  resources: ResourceCount;
  devCards: OwnedDevCard[];
  playedKnights: number;
  roads: string[];        // edge ids
  settlements: string[];  // vertex ids
  cities: string[];       // vertex ids
  piecesLeft: { roads: number; settlements: number; cities: number };
}

export type Phase =
  | "setup"       // snake-draft placement
  | "roll"        // waiting for current player's dice roll
  | "discard"     // 7 rolled, players with 8+ cards must discard half
  | "moveRobber"  // current player relocates the robber
  | "steal"       // current player picks a victim adjacent to robber
  | "main"        // trade + build + play dev card, then end turn
  | "gameOver";

export interface TradeOffer {
  from: number;
  give: Partial<ResourceCount>; // what the offerer pays
  want: Partial<ResourceCount>; // what the offerer receives
}

export interface Building {
  player: number;
  type: "settlement" | "city";
}

export interface GameState {
  seed: number;   // rng cursor — advances on every random draw, fully deterministic
  turn: number;
  phase: Phase;
  currentPlayer: number;
  players: Player[];
  board: Board;
  bank: ResourceCount;
  devDeck: DevCard[]; // pre-shuffled, draw from the end
  dice: [number, number] | null;
  // setup bookkeeping
  setupOrder: number[]; // snake: [0..n-1, n-1..0]
  setupIndex: number;
  awaitingSetupRoad: boolean;
  lastSettlement: string | null;
  // turn bookkeeping
  pendingDiscards: Record<number, number>; // playerIdx -> cards they must discard
  tradeOffer: TradeOffer | null;
  playedDevThisTurn: boolean;
  pendingFreeRoads: number; // from Road Building
  // derived-but-cached lookups (kept in sync by the reducer)
  buildings: Record<string, Building>; // vertex -> building
  roadOwner: Record<string, number>;   // edge -> player
  // awards
  longestRoad: { holder: number | null; length: number };
  largestArmy: { holder: number | null; size: number };
  winner: number | null;
  log: string[];
}

export type Action =
  | { type: "placeSetupSettlement"; vertex: string }
  | { type: "placeSetupRoad"; edge: string }
  | { type: "roll"; forced?: [number, number] } // `forced` is for tests/replays; the server never accepts it from clients
  | { type: "discard"; resources: Partial<ResourceCount> }
  | { type: "moveRobber"; tile: string }
  | { type: "steal"; target: number }
  | { type: "buildRoad"; edge: string }
  | { type: "buildSettlement"; vertex: string }
  | { type: "buildCity"; vertex: string }
  | { type: "buyDevCard" }
  | { type: "playDevCard"; card: Exclude<DevCard, "victoryPoint">; resource?: Resource; resources?: [Resource, Resource] }
  | { type: "bankTrade"; give: Resource; want: Resource }
  | { type: "offerTrade"; give: Partial<ResourceCount>; want: Partial<ResourceCount> }
  | { type: "acceptTrade" }
  | { type: "cancelTrade" }
  | { type: "endTurn" };

export class RulesError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "RulesError";
  }
}

export const COSTS: Record<"road" | "settlement" | "city" | "devCard", Partial<ResourceCount>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { wheat: 1, sheep: 1, ore: 1 },
};

export const WIN_VP = 10;
export const DISCARD_THRESHOLD = 8; // 8+ cards discard half (rounded down) on a 7
