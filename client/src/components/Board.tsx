// ---------------------------------------------------------------------------
// E4-01/02/03 — hex board renderer, driven PURELY by server state.
// SVG for the MVP: real DOM click targets on vertices/edges/tiles (testable,
// accessible). The PixiJS/WebGL upgrade is an Epic 6 polish swap — same props.
// ---------------------------------------------------------------------------
import type { ClientView } from "@tacan/server/view";
import { edgeEnds, hexCenter, hexCorners, outward, vertexPos } from "../geometry";

const TILE_COLORS: Record<string, string> = {
  wood: "#2d6a4f",
  brick: "#c05a3a",
  sheep: "#83c576",
  wheat: "#e5b93c",
  ore: "#8d99ae",
  desert: "#d8c49a",
};

export const PLAYER_COLORS = ["#e63946", "#457b9d", "#2a9d8f", "#e9c46a", "#9b5de5", "#f4845f"];

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
        return (
          <g key={t.id} data-testid={`tile-${t.id}`} className="tile" onClick={() => onTileClick?.(t.id)}>
            <polygon points={hexCorners(t.id)} fill={TILE_COLORS[t.resource]} stroke="#1b2432" strokeWidth={2} />
            {t.token !== null && (
              <g pointerEvents="none">
                <circle cx={cx} cy={cy} r={14} fill="#f6f1e6" />
                <text x={cx} y={cy + 5} textAnchor="middle" fontSize={hot ? 15 : 12} fontWeight={700}
                  fill={hot ? "#c1121f" : "#2b2d42"}>{t.token}</text>
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
            <line x1={a[0]} y1={a[1]} x2={mx} y2={my} stroke="#c9b458" strokeDasharray="3 3" />
            <line x1={c[0]} y1={c[1]} x2={mx} y2={my} stroke="#c9b458" strokeDasharray="3 3" />
            <text x={mx} y={my + 3} textAnchor="middle" fontSize={10} fill="#e8e4d8">
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

      {/* roads */}
      {Object.entries(view.roadOwner).map(([e, owner]) => {
        const [[x1, y1], [x2, y2]] = edgeEnds(e);
        return (
          <line key={e} data-testid={`road-${e}`} pointerEvents="none"
            x1={x1} y1={y1} x2={x2} y2={y2} stroke={PLAYER_COLORS[owner]} strokeWidth={7} strokeLinecap="round" />
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
            fill={color} stroke="#14110f" strokeWidth={1.5} onClick={() => onVertexClick?.(v)} />
        ) : (
          <g key={v} data-testid={`bld-${v}`} className="bld" onClick={() => onVertexClick?.(v)}>
            <rect x={x - 9} y={y - 9} width={18} height={18} rx={2} fill={color} stroke="#14110f" strokeWidth={2} />
            <circle cx={x} cy={y} r={4} fill="#14110f" />
          </g>
        );
      })}

      {/* E4-03 — the robber */}
      <g data-testid="robber" pointerEvents="none">
        <circle cx={rx + 18} cy={ry - 15} r={10} fill="#14110f" stroke="#f6f1e6" strokeWidth={1.5} />
      </g>
    </svg>
  );
}
