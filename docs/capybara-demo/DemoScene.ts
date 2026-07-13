import { createGame } from "../Game";
import type { GameMapData } from "../Game";

/**
 * Minimal hand-authored demo scene (no generated assets).
 *
 * Proves the engine runs end-to-end with local placeholder art:
 * a grass map + a 4-frame walk-cycle character you drive with WASD / arrows.
 * Art lives in `/demo-assets/` and is served by live-server from the repo root.
 *
 * This is the kind of scene a coding agent would normally generate against the
 * `src/Game.ts` facade; here it's written by hand so it works fully offline
 * (the hosted Capybara asset pipeline needs an API key + network).
 */
export function createDemoScene(_opts: {
  onAudioReady?: (start: () => void) => void;
} = {}) {
  // Inline map. No walkableBoxes + no masks => the whole field is walkable.
  const map: GameMapData = {
    name: "demo-field",
    panel: {
      url: "/demo-assets/map.png",
      masks: [],
      spriteSheets: [],
      walkableBoxes: [],
      placement: [],
      mapOverlays: [],
    },
    panelPixelWidth: 1500,
    panelPixelHeight: 1000,
  };

  const game = createGame({
    canvasId: "game",
    map,
    cameraEdgePadding: 120,
  });

  // Player: one "default_animation" sheet = 4 horizontal frames (256x96 strip).
  game.defineArchetype("player", {
    spriteSheets: [
      {
        name: "default_animation",
        url: "/demo-assets/player.png",
        frame_count: 4,
        width: 64,
        height: 96,
      },
    ],
    speed: 240,
    radius: 22,
    width: 64,
    height: 96,
    frameDurationMs: 120,
    label: "You",
  });

  // Feet position: feetX = horizontal center, feetY = bottom/ground anchor.
  const playerId = game.spawnAtFeet("player", 500, 640);
  game.setControlledEntity(playerId);

  // Lightweight on-screen instructions (plain DOM, no widget system needed).
  const hud = document.getElementById("hud-root");
  if (hud) {
    const banner = document.createElement("div");
    banner.textContent = "WASD / Arrow keys to move";
    Object.assign(banner.style, {
      position: "absolute",
      top: "16px",
      left: "16px",
      padding: "8px 14px",
      font: "600 16px/1.2 system-ui, sans-serif",
      color: "#fff",
      background: "rgba(20,24,28,0.72)",
      borderRadius: "10px",
      pointerEvents: "none",
      userSelect: "none",
    } as CSSStyleDeclaration);
    hud.appendChild(banner);
  }

  return game;
}
