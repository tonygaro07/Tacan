# Capybara 2.5D Engine — Overview & Setup

Reference notes for evaluating **`d-liya/capybara_2d_engine`**, an open-source
2.5D game engine built to be driven by AI coding agents (Claude Code, Codex)
rather than by a human clicking around an editor.

- Repo: https://github.com/d-liya/capybara_2d_engine
- Developer portal / MCP + API key: https://developer.capybara.build
- Community: Discord (linked from the repo README)
- License: MIT

> This is an early community project (template `v1.0.0`). Treat its docs as thin
> and expect rough edges. These notes were written while getting it running in a
> clean Linux sandbox.

## What it is

Most people "vibe-code" games inside engines that were never designed for AI, so
the agent gets lost in a huge, unpredictable API. Capybara flips that: the
**entire public engine interface lives in one file, `src/Game.ts`** (a
`createGame()` facade). That small, stable surface is something an agent can read
once and then confidently generate maps, characters, props, systems, and
gameplay logic against.

What ships in the box:

- **AI-first architecture** — thin public API over deep internals; the agent
  writes the gameplay code directly against the `Game.ts` facade.
- **Built-in server SDK** (`src/sdk/`) — player accounts, cloud saves, and
  multiplayer in "a line or two," so there's no backend to wire up yourself.
- **Asset generation pipeline** — via an optional hosted **Capybara MCP**,
  agents can generate maps/characters/props/audio/HUD art (needs an API key;
  coding agents can't produce those assets natively).
- **Baked-in agent setups** — `CLAUDE.md` + `AGENTS.md` + a project skill
  (`capybara-game-developer`) so it works with whatever agent you already use.
- **Dependency-light** TypeScript codebase small enough to hold in an agent's
  context.

The engine runs **standalone** — you can build and ship gameplay without the
hosted asset service. The MCP/API key is only needed for automated asset
generation.

## Project layout (the parts that matter)

| Path | Role |
|---|---|
| `src/Game.ts` | Public facade API (`createGame()`). The primary interface — prefer it over `src/core/`. |
| `src/main.ts` | Bootstrap: preloads assets/audio, creates the loading gate, then delegates to scene creation. |
| `src/scenes/` | Scene entrypoints. Each calls `createGame()` and wires resources/archetypes/systems/inputs/widgets. |
| `src/systems/` | Per-frame gameplay logic, `(dt, game) => {...}`. |
| `src/archetypes/` | Reusable entity prefabs (body/render). |
| `src/widgets/` | DOM HUD plugins mounted via `game.useWidget()`. |
| `src/data/` | Generated JSON assets + TS handles. `assets.md` is the agent-facing manifest and source of truth. |
| `src/sdk/` | SDK facade for save/load, auth, multiplayer. |
| `src/core/` | Runtime internals — do **not** import directly; use the facade. |
| `docs/recipes/` | Implementation patterns (farming-sim, combat, inventory, NPC dialogue, save-load, ...). |

Key conventions: normalized coordinates (0–1000 per panel), entity `x`/`y` is the
**top-left** corner, spawn with `spawnAtFeet` / `spawnCentered` / `placeProp`,
and the player is an entity you spawn then mark with `game.setControlledEntity()`.
The template ships **with no scene wired in** — `src/main.ts` leaves scene
creation to you/your agent, so a fresh clone renders a blank dark canvas until a
scene calls `createGame()`.

## Getting it running locally

Prerequisites: Node.js (tested on v22), npm, git.

```bash
git clone https://github.com/d-liya/capybara_2d_engine
cd capybara_2d_engine
npm install
npm run dev        # css watch + esbuild watch + live-server on http://localhost:3000
```

`npm run dev` runs three watchers concurrently (CSS via Tailwind v4, JS via
esbuild, and `live-server`). `npm run typecheck` runs `tsc --noEmit`
(strict mode is intentionally off for rapid prototyping).

### Gotcha: missing native binaries on Linux (Tailwind v4 / lightningcss)

On a clean install, `npm run dev` may crash the CSS step with
`MODULE_NOT_FOUND` for a `*.node` native binary — first `lightningcss`, then
`@tailwindcss/oxide`. Because the `dev` script uses `concurrently -k`, that one
failure kills the JS bundler and server too, so the whole thing looks dead.

Cause: the platform-specific optional dependencies that ship the native binaries
weren't installed. Fix by installing **both in a single command** (installing
them one at a time prunes the previous one):

```bash
# versions must match the installed lightningcss / @tailwindcss/oxide
npm install --no-save \
  lightningcss-linux-x64-gnu@1.32.0 \
  @tailwindcss/oxide-linux-x64-gnu@4.3.0
```

Look up the exact versions with:
```bash
node -p "require('./node_modules/lightningcss/package.json').version"
node -p "require('./node_modules/@tailwindcss/oxide/package.json').version"
```

Note: `--no-save` installs are pruned by any later `npm install`, so re-run this
if you reinstall. (On a different OS/arch, install the matching
`*-<platform>-<arch>` packages instead.)

Once fixed, `npm run dev` serves cleanly — `index.html` and `dist/main.js` return
HTTP 200, `dist/styles.css` builds, and the page mounts its `<canvas id="game">`.

> **Verified end-to-end offline.** A hand-authored demo scene (grass map + a
> WASD-driven walking character, no hosted assets) runs with working movement,
> camera-follow, and hover labels. See [`capybara-demo/`](./capybara-demo/) for
> the scene, a zero-dependency placeholder-art generator, a screenshot, and
> reproduce steps.

### Expected console noise in a sandboxed/offline environment

`index.html` pulls several **external** resources: Google Fonts, `capybara.build`
favicons/manifest, a custom cursor SVG, and the hosted SDK client
(`assets.capybara.build/js/game-api-client.js`). In a network-restricted
environment these fail with `ERR_TUNNEL_CONNECTION_FAILED` / `ERR_CONNECTION_RESET`.
These are **not engine errors** — the engine bundle itself loads and runs. They
resolve on a machine with normal outbound internet.

## Using it with an agent

1. Open the engine folder in Claude Code (`claude` from inside the repo). It
   auto-loads `CLAUDE.md` → `AGENTS.md`.
2. The agent should load the **`capybara-game-developer`** skill before writing
   gameplay code or calling asset tools.
3. Point the agent at `src/Game.ts` as the interface, then describe the game
   ("a farming sim where I plant crops on a 6×3 grid") and let it generate the
   scene/systems/archetypes.
4. For auto-generated art/audio, set up the Capybara MCP + API key from
   developer.capybara.build. Without it, the engine still works — you just supply
   assets another way. If MCP tools are unavailable, don't fake generation.

**Tip from their docs:** if assets look wrong, check the original file in
`src/data` before regenerating — the art is usually fine; agents just wire it in
with the wrong aspect ratio.
