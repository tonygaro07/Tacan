# Connecting Capybara "for real" (asset gen + cloud SDK)

The engine runs fully offline (see `capybara-demo/`). Going from that to *the
thing in the video* — an agent generating maps/characters/audio on the fly, plus
cloud saves/accounts/multiplayer — needs **two separate cloud connections**.
Neither is a code problem. Here's exactly what each requires and who must
provide it.

## The two connection points

### 1. Asset generation — the `capybara-mcp` server (needs an API key)

The agent generates art by calling tools exposed by a **Capybara MCP server**.
That server is *not* part of the repo and *not* connected to this session — it's
something you add to your coding agent's MCP config, authenticated with an API
key.

- The **API key** is only for this (asset generation). It is obtained by signing
  in at <https://developer.capybara.build> → create an API key → copy the MCP
  install command shown in the console. Generation costs credits (~3–4 min per
  job; a cancelled-but-submitted job still bills).
- Claude can't create your account or key, and can't read the console (login-
  gated). So **you must fetch the exact install command from the console** — the
  package/command name isn't documented publicly, don't guess it.
- Once you have it, add it to Claude Code. Either:
  ```bash
  claude mcp add capybara-mcp -- <exact command from the developer console>
  ```
  or a project-root `.mcp.json` (template: `capybara-mcp.template.json` in this
  folder — replace the command/args/env with the console's real values).
- Verify with `/mcp` in Claude Code: `capybara-mcp` should list its tools. Then
  the `.claude/skills/capybara-game-developer` skill (already in the engine repo)
  can drive generation.

### 2. Cloud SDK — `window.gameId` + the CDN client (accounts / saves / multiplayer)

`src/sdk/` talks to Capybara's backend. It boots from a global `window.gameId`
and a client script the page loads from their CDN. Look at `src/sdk/Core.ts`:

```ts
if (!window.GameServerClient) throw new Error("GameServerClient script not loaded from CDN.");
const resolvedGameId = window.gameId;
if (!resolvedGameId) throw new Error("Missing window.gameId. Set it in index.html before using the SDK.");
```

So to connect the SDK:

1. Register/create a game on the Capybara platform to get a **game id**.
2. Set it in `index.html` **before** the CDN client script:
   ```html
   <script>window.gameId = "YOUR_GAME_ID";</script>
   <script src="https://assets.capybara.build/js/game-api-client.js"></script>
   ```
   (The CDN `<script>` is already in the template; only `window.gameId` is
   missing.) The SDK then guest-auths automatically on first `sdk.save.*` /
   `sdk.multiplayer.*` call. No API key goes in the client. Override the server
   with `sdk.init({ baseUrl })` only for custom deployments.

Until `window.gameId` is set, the SDK is simply unused — the engine and gameplay
still run (our demo doesn't touch the SDK). It only throws if you *call* an
`sdk.*` method with no gameId.

## The blocker in THIS environment: network policy

Both connections talk to `*.capybara.build`, and **this Claude-on-the-web
sandbox blocks that host at the proxy** (verified: `403 CONNECT tunnel failed`
for `assets.capybara.build` and `developer.capybara.build`). The proxy allowlist
here is only package registries + Anthropic. So even with a key + gameId, MCP
generation and SDK calls **cannot succeed from this environment**.

Two ways to get a working network path:

- **Recommended — run it locally.** On your own machine, Claude Code has normal
  internet and MCP servers install natively. Clone the engine, add the MCP with
  your key, set `window.gameId`, `npm run dev`. Nothing is proxy-blocked.
- **Or — use a web environment whose network policy allows `capybara.build`.**
  The policy is chosen when the environment is created; see
  <https://code.claude.com/docs/en/claude-code-on-the-web> (network policy /
  custom domain allowlist). A default-restricted environment won't reach it.

## TL;DR — what's actually "missing"

| Piece | Provides | Who supplies it | Doable in this sandbox? |
|---|---|---|---|
| Capybara **API key** | asset generation auth | **You** (developer.capybara.build, login + credits) | No — login-gated |
| **capybara-mcp** in agent config | the generate tools | You add it (Claude can scaffold `.mcp.json`) | No — needs key + network |
| **game id** in `index.html` | SDK backend identity | **You** (register a game) | No — platform login |
| **Network path** to `capybara.build` | lets 1–3 actually talk | **You** (run locally, or allow the domain in the env policy) | No — proxy blocks it |
| Engine + gameplay code | the game itself | Claude (done — see `capybara-demo/`) | **Yes** |

Nothing here is a bug or a coding gap. Everything up to the account/key/network
line is ready; those four rows are decisions only you can make. The fastest real
connection is: **run the engine locally in your own Claude Code, paste the MCP
command from your console, set your game id.**
