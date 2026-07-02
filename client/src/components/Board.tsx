// ---------------------------------------------------------------------------
// E4-01/02/03 — hex board renderer, driven PURELY by server state.
// E6 InkShadow pass: neon-on-ink duotone tiles, glowing roads/pieces, dark
// token chips. Resource identity is kept readable via hue (green=wood,
// magenta=brick, lime=sheep, gold=wheat, violet=ore) — theme never taxes
// gameplay clarity.
// ---------------------------------------------------------------------------
import type { ClientView } from "@tacan/server/view";
import { edgeEnds, hexCenter, hexCorners, outward, vertexPos } from "../geometry";

const TILE_STYLE: Record<string, { fill: string; stroke: string }> = {
  wood:   { fill: "#0e2f22", stroke: "#34d399" },
  brick:  { fill: "#3a1626", stroke: "#ff2ec4" },
  sheep:  { fill: "#1a3413", stroke: "#a3e635" },
  wheat:  { fill: "#33270c", stroke: "#fbbf24" },
  ore:    { fill: "#1c1832", stroke: "#b07cff" },
  desert: { fill: "#242031", stroke: "#5b5470" },
};

export const PLAYER_COLORS = ["#ff2ec4", "#5ee9ff", "#a3e635", "#fbbf24", "#b07cff", "#f4845f"];

// E4-04 — resources with generated InkShadow tile art in /public/art/tiles.
// Anything not in this set falls back to the duotone polygon (currently: brick).
const TILE_ART = new Set(["wood", "brick", "wheat", "sheep", "ore", "desert"]);
const ART_SIZE = 104; // px in board units; slightly wider than the hex so the art's own frame becomes the tile border

interface Props {
  view: ClientView;
  onVertexClick?: (vertex: string) => void;
  onEdgeClick?: (edge: string) => void;
  onTileClick?: (tile: string) => void;
}

export function Board({ view, onVertexClick, onEdgeClick, onTileClick }: Props) {
  const b = view.board;
  const [rx, ry] = hexCenter(b.robberTile);
  return (
    <svg viewBox="-285 -265 570 530" className="board" data-testid="board" role="img" aria-label="Tacan board">
      {b.tiles.map((t) => {
        const [cx, cy] = hexCenter(t.id);
        const hot = t.token === 6 || t.token === 8;
        const s = TILE_STYLE[t.resource];
        return (
          <g key={t.id} data-testid={`tile-${t.id}`} className="tile" onClick={() => onTileClick?.(t.id)}>
            <polygon points={hexCorners(t.id)} fill={s.fill} stroke={s.stroke} strokeWidth={1.6} strokeOpacity={0.85} />
            {TILE_ART.has(t.resource) && (
              <image
                href={`/art/tiles/${t.resource}.png`}
                x={cx - ART_SIZE / 2} y={cy - ART_SIZE / 2}
                width={ART_SIZE} height={ART_SIZE}
                pointerEvents="none"
              />
            )}
            {t.token !== null && (
              <g pointerEvents="none">
                <circle cx={cx} cy={cy} r={14} fill="#0d0a18" stroke={hot ? "#ff2ec4" : "#3a3352"} strokeWidth={1.5}
                  className={hot ? "token-hot" : undefined} />
                <text x={cx} y={cy + 5} textAnchor="middle" fontSize={hot ? 15 : 12} fontWeight={700}
                  fill={hot ? "#ff2ec4" : "#cfc7ea"}>{t.token}</text>
              </g>
            )}
          </g>
        );
      })}

      {b.ports.map((p) => {
        const a = vertexPos(p.vertices[0]);
        const c = vertexPos(p.vertices[1]);
        const [mx, my] = outward([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], 1.22);
        return (
          <g key={p.id} className="port" pointerEvents="none">
            <line x1={a[0]} y1={a[1]} x2={mx} y2={my} stroke="#5ee9ff" strokeOpacity={0.5} strokeDasharray="3 3" />
            <line x1={c[0]} y1={c[1]} x2={mx} y2={my} stroke="#5ee9ff" strokeOpacity={0.5} strokeDasharray="3 3" />
            <text x={mx} y={my + 3} textAnchor="middle" fontSize={10} fill="#5ee9ff">
              {p.type === "generic" ? "3:1" : `2:1 ${p.type}`}
            </text>
          </g>
        );
      })}

      {/* empty edge slots (fat invisible click targets) */}
      {b.edges.map((e) => {
        if (view.roadOwner[e] !== undefined) return null;
        const [[x1, y1], [x2, y2]] = edgeEnds(e);
        return (
          <line key={e} data-testid={`edge-${e}`} className="edge-slot"
            x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={11}
            onClick={() => onEdgeClick?.(e)} />
        );
      })}

      {/* roads — neon glow via CSS drop-shadow(currentColor) */}
      {Object.entries(view.roadOwner).map(([e, owner]) => {
        const [[x1, y1], [x2, y2]] = edgeEnds(e);
        return (
          <line key={e} data-testid={`road-${e}`} className="road" pointerEvents="none"
            style={{ color: PLAYER_COLORS[owner] }}
            x1={x1} y1={y1} x2={x2} y2={y2} stroke={PLAYER_COLORS[owner]} strokeWidth={6.5} strokeLinecap="round" />
        );
      })}

      {/* buildings + empty vertex slots */}
      {b.vertices.map((v) => {
        const bld = view.buildings[v];
        const [x, y] = vertexPos(v);
        if (!bld) {
          return (
            <circle key={v} data-testid={`vertex-${v}`} className="vertex-slot"
              cx={x} cy={y} r={8.5} fill="transparent" onClick={() => onVertexClick?.(v)} />
          );
        }
        const color = PLAYER_COLORS[bld.player];
        return bld.type === "settlement" ? (
          <rect key={v} data-testid={`bld-${v}`} className="bld" x={x - 7} y={y - 7} width={14} height={14} rx={2}
            style={{ color }} fill={color} stroke="#0d0a18" strokeWidth={1.5} onClick={() => onVertexClick?.(v)} />
        ) : (
          <g key={v} data-testid={`bld-${v}`} className="bld" style={{ color }} onClick={() => onVertexClick?.(v)}>
            <rect x={x - 9} y={y - 9} width={18} height={18} rx={2} fill={color} stroke="#0d0a18" strokeWidth={2} />
            <circle cx={x} cy={y} r={4} fill="#0d0a18" />
          </g>
        );
      })}

      {/* E4-03 — the robber, ink-black with a hot rim */}
      <g data-testid="robber" pointerEvents="none" className="robber">
        <circle cx={rx + 18} cy={ry - 15} r={10} fill="#05030c" stroke="#ff2ec4" strokeWidth={1.5} />
      </g>
    </svg>
  );
}
