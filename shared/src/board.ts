// ---------------------------------------------------------------------------
// E1-01 — Board generator
// 19 hexes (radius-2 hexagon, axial coords), 18 number tokens, robber on the
// desert, 9 coastal ports (4 generic 3:1, 5 resource 2:1).
// Geometry facts the tests assert: 54 vertices, 72 edges, 30 coastal vertices.
// ---------------------------------------------------------------------------

import { Board, Port, PortType, Resource, Tile } from "./types.js";
import { shuffle } from "./rng.js";

// Pointy-top axial neighbor directions, in ring order.
const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

export const hexKey = (q: number, r: number): string => `${q},${r}`;

export function boardHexCoords(): [number, number][] {
  const out: [number, number][] = [];
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++)
      if (Math.abs(q + r) <= 2) out.push([q, r]);
  return out;
}

/** Corner i of hex (q,r) = the sorted triple {hex, neighbor_i, neighbor_i+1}. */
function cornerVertexId(q: number, r: number, i: number): string {
  const [dq1, dr1] = DIRS[i];
  const [dq2, dr2] = DIRS[(i + 1) % 6];
  return [hexKey(q, r), hexKey(q + dq1, r + dr1), hexKey(q + dq2, r + dr2)].sort().join("|");
}

export const edgeId = (v1: string, v2: string): string => [v1, v2].sort().join("&");

/** Cartesian center of a hex — used only to order the coastline for ports. */
function hexCenter(key: string): [number, number] {
  const [q, r] = key.split(",").map(Number);
  return [Math.sqrt(3) * (q + r / 2), 1.5 * r];
}

function vertexPosition(vertexId: string): [number, number] {
  const centers = vertexId.split("|").map(hexCenter);
  return [
    (centers[0][0] + centers[1][0] + centers[2][0]) / 3,
    (centers[0][1] + centers[1][1] + centers[2][1]) / 3,
  ];
}

function areHexesAdjacent(a: string, b: string): boolean {
  const [qa, ra] = a.split(",").map(Number);
  const [qb, rb] = b.split(",").map(Number);
  return DIRS.some(([dq, dr]) => qa + dq === qb && ra + dr === rb);
}

const TILE_RESOURCE_POOL: (Resource | "desert")[] = [
  "wood", "wood", "wood", "wood",
  "brick", "brick", "brick",
  "sheep", "sheep", "sheep", "sheep",
  "wheat", "wheat", "wheat", "wheat",
  "ore", "ore", "ore",
  "desert",
];
// NOTE: the original masterplan said 4 brick, but 4+4+4+4+3+1 = 20 tiles and
// the board only has 19. Standard distribution is 3 brick — used here.
// The E1-01 test asserts the pool sums to 19.

const NUMBER_TOKEN_POOL = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const PORT_TYPE_POOL: PortType[] = [
  "generic", "generic", "generic", "generic",
  "wood", "brick", "sheep", "wheat", "ore",
];

export function generateBoard(seed: number): Board {
  // --- static geometry -----------------------------------------------------
  const hexCoords = boardHexCoords();
  const tileIds = hexCoords.map(([q, r]) => hexKey(q, r));
  const tileIdSet = new Set(tileIds);

  const vertexSet = new Set<string>();
  const edgeSet = new Set<string>();
  const tileVertices: Record<string, string[]> = {};
  const vertexTiles: Record<string, string[]> = {};
  const edgeVertices: Record<string, [string, string]> = {};
  const vertexEdges: Record<string, string[]> = {};
  const vertexNeighbors: Record<string, string[]> = {};

  for (const [q, r] of hexCoords) {
    const tid = hexKey(q, r);
    const corners = Array.from({ length: 6 }, (_, i) => cornerVertexId(q, r, i));
    tileVertices[tid] = corners;
    for (const v of corners) {
      vertexSet.add(v);
      (vertexTiles[v] ??= []).includes(tid) || vertexTiles[v].push(tid);
    }
    for (let i = 0; i < 6; i++) {
      const v1 = corners[i];
      const v2 = corners[(i + 1) % 6];
      const e = edgeId(v1, v2);
      if (!edgeSet.has(e)) {
        edgeSet.add(e);
        edgeVertices[e] = [v1, v2].sort() as [string, string];
      }
    }
  }
  for (const e of edgeSet) {
    const [v1, v2] = edgeVertices[e];
    (vertexEdges[v1] ??= []).push(e);
    (vertexEdges[v2] ??= []).push(e);
    (vertexNeighbors[v1] ??= []).push(v2);
    (vertexNeighbors[v2] ??= []).push(v1);
  }

  // --- randomized content --------------------------------------------------
  let s = seed;
  let resources: (Resource | "desert")[];
  [resources, s] = shuffle(TILE_RESOURCE_POOL, s);

  // Tokens: reshuffle until no two red tokens (6/8) sit on adjacent tiles.
  const nonDesertIds = tileIds.filter((_, i) => resources[i] !== "desert");
  let tokens: number[] = [];
  for (let attempt = 0; attempt < 500; attempt++) {
    [tokens, s] = shuffle(NUMBER_TOKEN_POOL, s);
    const tokenOf: Record<string, number> = {};
    nonDesertIds.forEach((id, i) => (tokenOf[id] = tokens[i]));
    const reds = nonDesertIds.filter((id) => tokenOf[id] === 6 || tokenOf[id] === 8);
    const clash = reds.some((a) => reds.some((b) => a !== b && areHexesAdjacent(a, b)));
    if (!clash) break;
  }

  const tiles: Tile[] = tileIds.map((id, i) => {
    const [q, r] = id.split(",").map(Number);
    const resource = resources[i];
    return {
      id, q, r, resource,
      token: resource === "desert" ? null : tokens[nonDesertIds.indexOf(id)],
    };
  });

  const desert = tiles.find((t) => t.resource === "desert")!;

  // --- ports ---------------------------------------------------------------
  // Coastal vertices = corners touching fewer than 3 board tiles, ordered by
  // angle around the origin (the coast is star-shaped, so this walks the ring).
  const coastal = [...vertexSet]
    .filter((v) => vertexTiles[v].length < 3)
    .sort((a, b) => {
      const [ax, ay] = vertexPosition(a);
      const [bx, by] = vertexPosition(b);
      return Math.atan2(ay, ax) - Math.atan2(by, bx);
    });

  let portTypes: PortType[];
  [portTypes, s] = shuffle(PORT_TYPE_POOL, s);
  const PORT_STARTS = [0, 3, 6, 10, 13, 16, 20, 23, 26]; // 9 pairs spread over 30 coastal vertices
  const ports: Port[] = PORT_STARTS.map((start, i) => ({
    id: `port-${i}`,
    type: portTypes[i],
    vertices: [coastal[start], coastal[start + 1]],
  }));

  void tileIdSet;
  return {
    tiles,
    ports,
    robberTile: desert.id,
    vertices: [...vertexSet],
    edges: [...edgeSet],
    vertexTiles,
    tileVertices,
    edgeVertices,
    vertexEdges,
    vertexNeighbors,
  };
}
