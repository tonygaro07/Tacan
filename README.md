# Tacan

Private multiplayer hex board game for the friend group. Server-authoritative:
the browser is a dumb renderer, all rules run on the server (`shared/` engine).

## Quickstart

```bash
npm install
npm test              # full suite: 79 tests across rules engine, server, client
npm run dev:server    # game server on ws://localhost:2567
npm run dev:client    # UI on http://localhost:5173 (second terminal)
```

Open http://localhost:5173, pick a name, **Create room**, share the 5-letter
code. Friends join with the code (3–6 players), host starts. Disconnected?
Rejoin with the same code + name to get your seat back.

## Layout

| Folder | Package | What it is |
|---|---|---|
| `shared/` | `@tacan/rules` | Pure rules engine — zero UI/network. `applyAction(state, player, action) → state` |
| `server/` | `@tacan/server` | Colyseus room: room codes, seats, validation, redacted per-player broadcasts, reconnection |
| `client/` | `@tacan/client` | React + Vite + zustand. SVG board (PixiJS polish planned in Epic 6) |
| `scripts/smoke.mjs` | — | End-to-end smoke against a running server: `node scripts/smoke.mjs` |

## Deploying (Epic 9)

Three pieces, three homes:

1. **Client → Netlify.** `netlify.toml` is committed — link the repo, set `VITE_SERVER_URL=wss://<game-server>` in site env vars, deploy.
2. **Game server → Render (free tier)** — `render.yaml` is committed: New → Blueprint → connect this repo → apply. Free tier sleeps when idle (~30-60s wake on the first connect of game night). It cannot run on Netlify functions or Supabase — live websockets need a long-running Node process.
3. **Database → Supabase** (Epics 7-8 only). Decision: a NEW dedicated project (not ivalice-ninth-shard). Schema ready in `supabase/migrations/0001_tacan_schema.sql`; nothing uses it until trophies/history are built.

See `tacan-masterplan.md` for the full ticket backlog and progress.
