// ---------------------------------------------------------------------------
// E4-01 — board geometry: engine IDs -> screen coordinates
//
// The rules engine identifies a vertex by the 3 hexes that touch it
// ("q1,r1|q2,r2|q3,r3") and an edge by its two vertex ids ("v1&v2").
// The centroid of three mutually-adjacent hex centers IS their shared corner,
// so rendering needs no lookup tables — pure math from the id strings.
// ---------------------------------------------------------------------------

export const HEX_SIZE = 48;

/** Pointy-top axial -> pixel center. */
export function hexCenter(key: string): [number, number] {
  const [q, r] = key.split(",").map(Number);
  return [Math.sqrt(3) * HEX_SIZE * (q + r / 2), 1.5 * HEX_SIZE * r];
}

/** SVG polygon points string for a tile. */
export function hexCorners(key: string): string {
  const [cx, cy] = hexCenter(key);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${cx + HEX_SIZE * Math.cos(a)},${cy + HEX_SIZE * Math.sin(a)}`;
  }).join(" ");
}

/** Vertex id -> pixel position (centroid of its 3 hex centers). */
export function vertexPos(id: string): [number, number] {
  const cs = id.split("|").map(hexCenter);
  return [(cs[0][0] + cs[1][0] + cs[2][0]) / 3, (cs[0][1] + cs[1][1] + cs[2][1]) / 3];
}

/** Edge id -> its two pixel endpoints. */
export function edgeEnds(id: string): readonly [[number, number], [number, number]] {
  const [a, b] = id.split("&");
  return [vertexPos(a), vertexPos(b)] as const;
}

/** Push a point outward from the origin (used to place port labels off-shore). */
export function outward(p: [number, number], factor: number): [number, number] {
  return [p[0] * factor, p[1] * factor];
}
