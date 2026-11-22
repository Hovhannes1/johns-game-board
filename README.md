# John's Game Board

A 100% static, serverless **peer-to-peer (WebRTC)** board game platform built with Next.js, TypeScript, and [Trystero](https://github.com/dmotz/trystero) — hosted directly on **GitHub Pages** with no dedicated backend server and no VPN required.

**Available games:**
- **Splendor** — 2–4 players online (WebRTC P2P) or hot-seat on one device.

---

## How it works

1. **Main Gallery (`/`)** — pick a game, resume a hosted room saved in your browser, or paste a room code / invite link.
2. **Host-authoritative WebRTC** — the player who creates a room runs the authoritative game state, validation, turn timers, and IndexedDB persistence inside their browser tab.
3. **Zero-server signaling** — peers discover each other over public Nostr relays using Trystero; signaling messages are encrypted with the 10-character room code carried in the URL `#hash` fragment (which never leaves the browser).
4. **ICE (STUN + optional TURN)** — connections try direct STUN (`stun.l.google.com:19302`, `stun.cloudflare.com:3478`) first and fall back to TURN if configured via `NEXT_PUBLIC_TURN_*` secrets.

---

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
```

### Useful scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Export static site to `out/` |
| `npm run preview` | Serve `out/` locally (`npx serve out`) |
| `npm run check` | Run Prettier, ESLint, TypeScript, and Vitest (including 1,000+ fuzzed games) |
| `npm run test:e2e` | Run Playwright e2e tests against `out/` using `?transport=broadcast` |

---

## Folder layout

- `app/` — Next.js App Router pages (`/` gallery, `/splendor/`, `/splendor/host/`, `/splendor/play/`, `/splendor/local/`, `/splendor/history/`).
- `platform/` — game-agnostic P2P infrastructure:
  - `platform/crypto.ts` — Web Crypto ID, room code, seed, and shuffle helpers.
  - `platform/games/` — `GameModule` interface and game registry.
  - `platform/net/` — `Transport` interface, `TrysteroTransport`, `BroadcastChannelTransport`, `LoopbackTransport` / `MemoryHub`, ICE & NAT pre-flight check, rate-limiters.
  - `platform/room/` — `HostRoomManager`, `HostRuntime`, `RoomClient`, `BrowserRoomStore` (IndexedDB + `localStorage` `clientKey`).
- `games/splendor/` — Splendor rules engine, card data, UI, and `module.ts`.

---

## Artwork

`games/splendor/components/art/` provides original vector SVG artwork used by default. Illustrated sprite sheets in `assets/*.jpg` are git-ignored and excluded from public GitHub Pages builds.
