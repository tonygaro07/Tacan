# Tacan — Build Plan & Ticket Backlog

*Design + architecture pass by Claude, ready to hand to a coworker / Fable 5 pairing session.*

---

## 0. Naming & IP

**Name locked: Tacan.** Private, friends-only play — no distribution, no monetization — keeps IP risk low. Still worth building original tile/piece art rather than reusing Catan's exact visuals; costs nothing extra and removes any ambiguity.

---

## 1. Core Game Design (automating the rulebook)

This is what the **rules engine** has to encode — the part that "reads what's supposed to happen."

**Board**
- 19 hex tiles: 4 Wood, 3 Brick, 4 Sheep, 4 Wheat, 3 Ore, 1 Desert *(fixed 2026-07-01: originally said 4 Brick = 20 tiles — caught by the E1-01 unit test)*
- Number tokens 2–12 (no 7) placed on all non-desert tiles, standard probability layout
- Robber starts on the Desert tile
- 9 harbor/port spaces on the coastline: 4 generic (3:1), 5 resource-specific (2:1)

**Setup**
- Turn order randomized, then **snake draft** placement: player 1→2→3→4, then 4→3→2→1
- Each player places 2 settlements + 2 connected roads
- Second settlement placed immediately produces starting resources

**Turn loop** (see `game-turn-flow.mermaid`)
1. Roll 2d6
2. **If 7:** every player with 8+ cards discards half (round down) → active player moves robber anywhere → steals 1 random card from an opponent adjacent to the new tile (if any have cards)
3. **If not 7:** every tile matching the roll number produces 1 resource per adjacent settlement (2 for a city) to its owner — *unless* the robber sits on that tile
4. Trade phase: bank (4:1), port (3:1 or 2:1), or player-to-player
5. Build phase — costs:
   - Road: 1 Wood + 1 Brick
   - Settlement: 1 Wood + 1 Brick + 1 Wheat + 1 Sheep (must be 2+ edges from any other settlement, connected to your road network)
   - City (upgrades a settlement): 2 Wheat + 3 Ore
   - Dev card: 1 Wheat + 1 Sheep + 1 Ore
6. Optionally play **one** dev card (not one bought this same turn) — Knight, Road Building, Year of Plenty, Monopoly. VP cards aren't "played," they just count silently toward your total.
7. Check win condition → end turn

**Dev card deck (25 total):** 14 Knight, 2 Road Building, 2 Year of Plenty, 2 Monopoly, 5 Victory Point

**Victory points (win at 10):**
- Settlement = 1, City = 2
- Longest Road (5+ connected segments, min) = 2 — steals if broken/overtaken
- Largest Army (3+ Knights played, min) = 2 — steals if overtaken
- VP dev card = 1 each (hidden until revealed)

---

## 2. Your Additions (not in the base rulebook — this is the product layer)

- **Landing screen:** create/join room, pick player count (3–6), pick a character avatar
- **Cosmetics:** avatar skins, piece skins (road/settlement/city reskins), board themes, profile frames — **purely visual, zero gameplay effect.** Keep this currency completely separate from in-game resources so there's never a "pay to win" ambiguity.
- **Winners screen:** end-of-game ranking by final VP, session recap, and **Trophy Points** earned → spendable in a cosmetic shop

---

## 3. Architecture

See `architecture-diagram.mermaid`. The one non-negotiable decision:

> **The rules engine must be authoritative on the server, not the client.**

Why this matters (and it's a genuinely useful thing to internalize for PM/Delivery conversations, not just this project): if the game logic lives in the browser, any player can open devtools and edit their local resource count. The client should be a "dumb" renderer that sends *intents* ("I want to build a road here") and receives *authoritative state* back. This is the same trust-boundary reasoning that shows up in any client-server system you'll scope as a Delivery Lead — "where does the source of truth live" is question #1 in any architecture review.

**Practical implication for the ticket order below:** the rules engine (Epic 1) is built as a **pure, framework-agnostic package with zero UI or network code.** It's just functions that take a game state + an action and return a new game state. That makes it trivially unit-testable and reusable on both server (authoritative) and — later, if you ever want it — an offline/local mode.

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React + TypeScript + Vite | Fast dev loop, huge ecosystem, TS catches state-shape bugs early |
| Board/animation rendering | PixiJS | WebGL-backed 2D renderer built for exactly this (juicy animations, hundreds of sprites, hex-grid friendly) |
| Client state | Zustand | Thin wrapper around whatever state the server pushes down — client never computes game logic itself |
| Realtime networking | **Colyseus** (Node.js) | Purpose-built for authoritative room-based multiplayer games — handles state sync, room lifecycle, and reconnection for you instead of hand-rolling it over raw Socket.io |
| Rules engine | Plain TypeScript package, shared/imported by the server | Framework-agnostic, unit-testable in isolation |
| Database | **Supabase (Postgres)** | You already have this connected — profiles, cosmetics inventory, match history |
| Auth | Supabase Auth, lightweight (magic link or just display name + room code) | This is a friend group, not a public product — don't over-build signup |
| Frontend hosting | Netlify or Vercel | Both already connected in your toolchain |
| **Game server hosting** | **Fly.io / Railway / Render — NOT Netlify or Vercel** | Serverless functions on Netlify/Vercel can't hold a persistent WebSocket connection open for a 45-minute Catan game. This needs a long-running process. Worth knowing as a general rule: *stateless serverless ≠ stateful realtime.* |

---

## 5. Build Phases (how to sequence the coworking sessions)

**Phase 1 — MVP (get a playable, ugly game working end to end)**
Epics 0, 1, 2, minimal 3 & 4, basic 9. No cosmetics, no fancy animation. Goal: 4 people can play a full correct game of the actual rules over the internet.

**Phase 2 — Product polish**
Full Epic 4 & 5 (board rendering, UI), Epic 6 (animations), full Epic 3 (character/cosmetic selection UI).

**Phase 3 — Meta-progression**
Epic 7 (winners screen, trophy economy), Epic 8 (persistent accounts/history).

---

## 6. Epic & Ticket Backlog

Priority: **P0** = MVP blocker · **P1** = important · **P2** = stretch/nice-to-have
Estimate: **S** < half day · **M** ~1 day · **L** 1–3 days

### EPIC 0 — Foundations
- **E0-01** | ✅ DONE | S — Game name: **Tacan**. Remaining: original tile/piece art direction, no Catan branding anywhere in repo/assets.
- **E0-02** | ✅ DONE 2026-07-01 | S — Monorepo scaffold: `/client`, `/server`, `/shared` (rules engine lives here). AC: shared package importable by server without duplicating code.
- **E0-03** | P1 | S — Basic CI (lint + test on push).

### EPIC 1 — Shared Rules Engine (pure logic, no UI/network)
- **E1-01** | ✅ DONE 2026-07-01 | M — Board generator: shuffle 19 tiles + number tokens into standard resource/probability distribution, place robber on desert.
- **E1-02** | ✅ DONE 2026-07-01 | M — Core data models: Tile, Vertex (settlement spot), Edge (road spot), Player, ResourceBank, DevCardDeck.
- **E1-03** | ✅ DONE 2026-07-01 | L — Turn state machine: Roll → Produce/Robber → Trade → Build → PlayDev → EndTurn, with explicit legal-transition checks.
- **E1-04** | ✅ DONE 2026-07-01 | S — Dice roll + resource distribution to all matching, non-robbed tiles.
- **E1-05** | ✅ DONE 2026-07-01 | M — Robber sequence: skip production on 7, 8+ card discard (half, rounded down), move robber, steal from an adjacent opponent with cards.
- **E1-06** | ✅ DONE 2026-07-01 | M — Build validation: cost check, settlement distance rule (2+ edges apart), road network connectivity.
- **E1-07** | ✅ DONE 2026-07-01 | M — Trading: bank 4:1, port 3:1/2:1 (based on settlement placement), player-to-player offer/accept.
- **E1-08** | ✅ DONE 2026-07-01 | L — Dev cards: draw, "can't play same turn purchased" rule, resolve Knight / Road Building / Year of Plenty / Monopoly effects.
- **E1-09** | ✅ DONE 2026-07-01 | M — VP calculator: settlements, cities, longest road (min 5, steal-on-overtake), largest army (min 3 knights, steal-on-overtake), hidden VP cards, win detection at 10.
- **E1-10** | ✅ DONE 2026-07-01 | L — Full unit test suite covering a complete scripted 4-player game. **Do this before touching UI** — it's your safety net for everything downstream.

### EPIC 2 — Multiplayer Server
- **E2-01** | ✅ DONE 2026-07-01 | M — Colyseus server scaffold + room type definition.
- **E2-02** | ✅ DONE 2026-07-01 | S — Create/join room by short code.
- **E2-03** | ✅ DONE 2026-07-01 | M — Bridge rules-engine state into Colyseus schema for broadcast.
- **E2-04** | ✅ DONE 2026-07-01 | M — Server-side action validation — reject any client action the rules engine says is illegal.
- **E2-05** | ✅ DONE 2026-07-01 | M — Reconnection handling (player refreshes mid-game, rejoins same seat).
- **E2-06** | P2 | S — Turn timer / AFK auto-skip (genuinely useful for friend games that drag).

### EPIC 3 — Landing & Lobby UI
- **E3-01** | ✅ DONE 2026-07-01 | S — Landing screen: create/join, player count selector (3–6).
- **E3-02** | ✅ DONE 2026-07-01 | M — *(Ivalice roster: 18 characters from the Friday Raid bible, portraits + accent colors, unique claims, reconnect-safe)* Character/avatar selection screen.
- **E3-03** | P1 | M — Cosmetic loadout picker (piece skins, board theme).
- **E3-04** | ✅ DONE 2026-07-01 | S — Lobby waiting room: shows joined players, ready-up, host starts game.

### EPIC 4 — Board Rendering
- **E4-01** | ✅ DONE 2026-07-01 *(MVP renders in SVG — same server-state-driven interface; PixiJS/WebGL is the Epic 6 polish swap)* | L — PixiJS hex board renderer driven purely by server state.
- **E4-02** | ✅ DONE 2026-07-01 | M — Click/hover interaction on vertices (settlements) and edges (roads).
- **E4-03** | ✅ DONE 2026-07-01 | S — Robber token render + move.
- **E4-04** | 🟨 PREPARED 2026-07-02 (InkShadow prompt pack + batch script in art/ and scripts/; run gen-art.mjs, then wire pattern fills) | M — Final tile/number-token art pass.
- **E4-05** | P1 | M — Player piece rendering with equipped cosmetic skins.

### EPIC 5 — Gameplay UI
- **E5-01** | ✅ DONE 2026-07-01 | S — Dice roll UI.
- **E5-02** | ✅ DONE 2026-07-01 | S — Resource hand tray.
- **E5-03** | ✅ DONE 2026-07-01 | M — Build menu with live affordability state (greyed out if you can't afford it).
- **E5-04** | ✅ DONE 2026-07-01 | M — Trade modal (bank/port + player-to-player offer).
- **E5-05** | ✅ DONE 2026-07-01 | M — Dev card hand + play modal.
- **E5-06** | ✅ DONE 2026-07-01 | S — Turn indicator + action log/notifications.
- **E5-07** | ✅ DONE 2026-07-01 | S — Discard modal (triggered on 7 for 8+ card players).
- **E5-08** | ✅ DONE 2026-07-01 | S — Steal-target picker modal (robber resolution).

### EPIC 6 — Animation & Polish (this is where "nice graphics" lives)
- **E6-00 InkShadow theme** | ✅ DONE 2026-07-02 — neon-noir palette across UI + board (CSS/SVG only, no assets)
- **E6-01** | P1 | M — Dice roll animation.
- **E6-02** | P1 | M — "Flying resource" animation on production.
- **E6-03** | P1 | S — Robber move + steal animation.
- **E6-04** | P1 | S — Building placement pop-in / city upgrade glow.
- **E6-05** | P1 | M — Winners screen reveal sequence.
- **E6-06** | P2 | S — SFX + ambient music (stretch).

### EPIC 7 — Winners Screen & Meta-Progression
- **E7-01** | ✅ DONE 2026-07-01 | M — Post-game summary: final VP breakdown per player.
- **E7-02** | P1 | S — Trophy point formula (placement-based, e.g. 1st=100/2nd=60/3rd=30/4th=10).
- **E7-03** | P1 | M — Persist trophy points to Supabase profile.
- **E7-04** | P1 | M — Cosmetic shop screen, spend trophy points.
- **E7-05** | P1 | S — Inventory/equip system.

### EPIC 8 — Accounts & Persistence
- **E8-01** | P1 | M — Lightweight Supabase Auth (magic link or name+code, no heavy onboarding).
- **E8-02** | 🟨 PREPARED 2026-07-01 (SQL in supabase/migrations; new dedicated project chosen, apply at Epic 7-8) | S — Postgres schema: `players`, `cosmetics_owned`, `match_history`.
- **E8-03** | P2 | S — Match history log/view.

### EPIC 9 — QA & Deployment
- **E9-01** | P0 | M — Scripted 4-player end-to-end playtest (manual or automated).
- **E9-02** | ✅ DONE 2026-07-02 (live at tacan.netlify.app) | S — Frontend deploy pipeline (Netlify/Vercel).
- **E9-03** | ✅ DONE 2026-07-02 (live at tacan-server.onrender.com, Render free tier) | M — Backend deploy on a persistent-connection host (Fly.io/Railway).
- **E9-04** | ✅ DONE 2026-07-01 *(env config done: VITE_SERVER_URL + PORT; secrets n/a yet)* | S — Environment config & secrets management.

**Total: ~48 tickets across 10 epics.** — *Sessions 1–2 complete: E0-02, all of Epic 1, and Epic 2 (E2-01→E2-05) shipped — 69 passing tests (59 rules engine + 10 networking). Session 3+: full client shipped incl. E3-02 character select (Ivalice roster) (landing, lobby, SVG board, all gameplay UI, winners screen) — the game is PLAYABLE end to end on localhost. 79 tests green. Remaining for MVP: E9-02/03 deploys (need hosting accounts). Note: state sync uses per-player redacted JSON broadcasts instead of Colyseus schema — simpler, and it hides opponents' hands/dev cards and the RNG seed from clients by construction.*

---

## 7. Using this at the coworking session with Fable 5

1. Feed Fable 5 **Epic 1 first, in order (E1-01 → E1-10)** — it's the highest-leverage work because everything else depends on a correct, tested rules engine, and it has zero UI/networking complexity to distract from correctness.
2. Paste tickets **one at a time**, not the whole backlog — gives you a natural checkpoint to review/test each piece before moving on.
3. After E1-10 (full test suite) passes, that's your natural "did we actually build the game correctly" milestone — worth pausing to verify before spending time on rendering.

---

## Your Next Steps

- [ ] Pick the game's name/branding (E0-01) — do this first, it's a 5-minute decision blocking nothing but good to lock in
- [ ] Review the two diagram files — confirm the architecture direction (server-authoritative + Colyseus) matches what you and your coworker want to build
- [ ] Decide Phase 1 scope with whoever's building this with you — I'd start the first session at **E1-01 through E1-10**
- [ ] If useful, I can also start scaffolding the repo/Supabase schema directly right now (I have Supabase, Netlify, and Vercel connected) — just say the word and I'll get a head start before your coworking session
