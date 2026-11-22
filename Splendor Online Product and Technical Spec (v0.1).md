# Splendor Online: Product and Technical Spec (v0.1)

Draft for review. Stack: Next.js, TypeScript, self-hosted, shared over Tailscale, password-protected multiplayer for real players only.

## 1. Vision and Scope

Build a faithful, polished, browser-based version of the Renaissance gem-trading card game Splendor (2 to 4 players, about 30 minutes per game). One person runs the app on their own machine, shares access with friends over the internet, and everyone plays in real time from a browser on desktop, tablet or phone.

**Goals**

- Rules-accurate implementation of the base game, enforced by the server.
- Visual quality that matches or beats the physical game: rich cards, tactile gem tokens, noble tiles, smooth animation.
- Runs locally with a single command; shareable with remote friends without cloud hosting.
- Strong security posture, because the host is exposing a service from a home or office machine.

**Non-goals for v1**

- Public matchmaking, accounts with email, payments, or a hosted SaaS.
- Expansions (Cities of Splendor, Strongholds, Trading Posts) and spin-offs (Splendor Duel, Marvel Splendor). The engine should be designed so these can be added later.
- Native mobile apps.
- AI bots or computer players: every seat is held by a real person.
- Languages other than English.

**Legal and asset note.** Splendor is designed by Marc André and published by Space Cowboys, and the name, artwork and card design are protected. This project should be used privately among friends. All art (card backgrounds, noble portraits, gem icons, logo) should be original or properly licensed, in the spirit of the original rather than copied from it. The rules and mechanics themselves are not protected, but the exact printed card list should be compiled and verified by us (see section 3.5).

## 2. Game Rules (Source of Truth)

Summarized from the published rulebook (Space Cowboys, via RulesPal) and cross-checked against several rules sites. Anything marked **Decision** is an ambiguity we should settle once and document.

### 2.1 Components

- **40 gem tokens:** 7 each of Emerald (green), Diamond (white), Sapphire (blue), Onyx (black), Ruby (red), plus 5 Gold jokers (yellow).
- **90 development cards** in three levels: 40 of Level I, 30 of Level II, 20 of Level III.
- **10 noble tiles**, each worth 3 prestige points.

Each development card has: a gem **bonus color** (one gem), an optional **prestige value**, and a **cost** made of gem colors (never gold).

### 2.2 Setup

- Shuffle each level deck separately. Reveal 4 face-up cards per level (a 3x4 grid, Level III at top).
- Shuffle nobles and reveal **players + 1** of them. The rest leave the game.
- Token supply depends on player count:
  - **4 players:** 7 of each gem color.
  - **3 players:** 5 of each gem color.
  - **2 players:** 4 of each gem color.
  - Gold is always 5.
- Noble count: 5 for 4 players, 4 for 3 players, 3 for 2 players.
- Starting player: the youngest. For the online version, randomize or let the host choose. Play proceeds clockwise.

### 2.3 Turn Structure

On their turn a player performs **exactly one** of four actions:

1. **Take 3 gem tokens of different colors.**
2. **Take 2 gem tokens of the same color**, only if at least 4 tokens of that color remain in the supply before taking.
3. **Reserve 1 development card and take 1 gold token.**
4. **Purchase 1 development card** (a face-up card or one of the player’s own reserved cards).

After the action, the end-of-turn checks run in this order: token limit, noble visit, end-game trigger.

### 2.4 Rule Details

- **Token limit:** a player may never hold more than 10 tokens (gold included) at end of turn. If over, they must return tokens to the supply until at most 10 remain, and may return tokens they just took. Token counts are public information.
- **Reserving:** the card is taken either from the face-up display, or blind from the top of any one of the three decks (hidden from opponents; visible only to the reserving player). A player may hold at most **3 reserved cards**. Reserved cards can only leave a hand by being purchased by that player. If the gold supply is empty the player can still reserve but receives no gold. The reserve action is the only way to obtain gold.
- **Buying:** the player pays the card’s cost in tokens. Each owned card’s bonus acts as one permanent token of that color (a discount). Gold can substitute for any missing color. A fully discounted card can cost zero tokens. Paid tokens (including gold) return to the supply.
- **Refill:** whenever a face-up card is bought or reserved, it is immediately replaced from the same level deck. If the deck is empty, the slot stays empty.
- **Nobles:** at the end of a turn, if the player has at least the bonuses shown on a noble tile (bonuses only, never tokens), they receive that noble. It is not an action, cannot be refused, and a player gets at most one noble per turn. If several nobles qualify, the player chooses which one to take.
- **End of game:** when a player reaches **15 or more prestige points** (cards plus nobles), the current round is completed so every player has had the same number of turns. The highest score wins. **Tie-break:** the tied player who purchased the fewest development cards wins. If still tied, they share the victory (**Decision**: show as a shared win).

### 2.5 Rule Edge Cases to Decide

- **Fewer than 3 colors available.** The printed rulebook says “3 different colors”. Many rulings and digital versions allow taking 2 or 1 tokens of different colors when fewer than 3 colors are left in the supply. **Decision (confirmed):** allow taking as many different colors as available, up to 3, and require at least 1.
- **Passing.** The base rules have no pass action. **Decision (confirmed):** if a player has no legal action at all, allow an explicit “Pass” so the game cannot deadlock.
- **Reserving from an empty deck.** Not allowed.
- **Reserving when holding 3 cards.** Not allowed.
- **Gold payment.** The engine auto-computes the cheapest payment (use discounts first, then tokens, then gold for the shortfall), while the UI lets the player see exactly what will be paid before confirming.

## 3. Functional Requirements

### 3.1 Lobby and Rooms

- **FR-1** Host creates a room with a name, a room password, player count (2 to 4), and optional settings (see 3.7).
- **FR-2** Joiners enter a room code (or follow an invite link) plus the password, choose a display name and pick a color or avatar.
- **FR-3** Lobby shows seated players, ready state, and lets the host start once the minimum number of players are ready.
- **FR-4** Host can kick a player or lock the room.
- **FR-5** A player who disconnects can **rejoin the same seat** with their session; the game waits, pauses or (optionally) auto-skips after a configurable timeout.
- **FR-6** Optional read-only **spectators** (off by default, never see hidden information such as blind-reserved cards).

### 3.2 Gameplay UI

- **FR-7** Board shows: 3x4 card grid with the three decks (with remaining counts), noble tiles, the six token piles with counts, and a bank of the supply.
- **FR-8** Each player area shows: tokens held, purchased cards stacked by color and staggered so bonuses and points stay visible, reserved cards (face-down to opponents, and for blind reserves, only the owner sees the face), nobles won, and current prestige total.
- **FR-9** Clear turn indicator, who is acting, and a scrolling game log (“Anna bought Level II emerald card for 2 white, 1 gold”).
- **FR-10** Legal moves are computed by the engine and highlighted. Illegal actions are disabled with a reason on hover or tap (for example “Only 3 colors can be taken” or “Not enough tokens”).
- **FR-11** Guided flows for multi-step actions: select tokens (with undo before confirm), purchase confirmation with payment breakdown, return-tokens prompt when over the limit, and noble-choice prompt when several qualify.
- **FR-12** End-game screen with final scores, tie-break explanation, turn statistics, and “play again” (same room, same seats).
- **FR-13** In-game rules reference panel and tooltips on every card and noble.
- **FR-14** Optional text chat and quick emotes.

### 3.3 Rules Engine

- **FR-15** A pure, deterministic TypeScript module (no framework, no I/O) that exposes: `createGame(config, seed)`, `getLegalActions(state, playerId)`, `applyAction(state, action)`, and `getPublicView(state, playerId)`.
- **FR-16** Actions are typed and validated: `TAKE_THREE`, `TAKE_TWO`, `RESERVE_FACE_UP`, `RESERVE_FROM_DECK`, `BUY_FACE_UP`, `BUY_RESERVED`, `RETURN_TOKENS`, `CHOOSE_NOBLE`, `PASS`.
- **FR-17** Game state is a serializable object that includes an append-only action log, so any game can be replayed or resumed.
- **FR-18** Shuffling uses a cryptographically secure RNG; the seed is kept server-side only.
- **FR-19** Every rule in section 2 has a matching automated test, including edge cases.

### 3.4 Hidden Information

- **FR-20** The server never sends deck order or other players’ blind-reserved card identities to clients. Each client receives a per-player redacted view.
- **FR-21** Reserved cards taken from the face-up display are public knowledge (everyone saw them); blind reserves are private to the owner.

### 3.5 Card and Noble Data

- **FR-22** All 90 cards and 10 nobles live in a versioned data file (JSON), validated by a schema and by tests: 40/30/20 counts per level, valid costs, and the distribution of bonus colors per level.
- **FR-23** The data file must be **compiled from published online card lists and cross-checked against at least two independent sources** before release, since the exact printed costs and points are what makes the game balanced. Differences between sources are resolved by hand, and the file is reviewed card by card before release.
- **FR-24** Because the data is external to the code, a “card pack” format makes future expansions and house variants possible.

### 3.6 Persistence and Recovery

- **FR-25** In-progress games survive a server restart (state snapshots to a local SQLite file after each action).
- **FR-26** Finished-game history is stored locally (players, scores, date) for a simple history page.

### 3.7 Optional Settings

- Turn timer (off, 60s, 120s, 180s) with auto-action on timeout.
- Seat order: random or as joined.
- Reveal-and-confirm mode for token returns.
- Sound on or off, reduced-motion mode.
- Spectators on or off.

## 4. Visual and UX Design

The goal is the look of the original (jewel tones, warm Renaissance palette, tactile materials) with modern polish. All art is a clean, original vector design (SVG), so it stays sharp at any size, loads fast and can be restyled in code.

### 4.1 Art Direction

- **Cards:** portrait cards with the gem bonus icon in the top right, prestige points in the top left, and the cost as colored gem circles stacked along the bottom left, like the physical cards. Card backs are color-coded by level. Each card gets a distinct vector background built from a small set of reusable gem and Renaissance-pattern motifs, finished with subtle gradients, shine and shadows.
- **Gem tokens:** thick, poker-chip style tokens with a faceted gem emblem, drop shadows and a slight 3D tilt. Gold joker tokens look distinct and warmer.
- **Nobles:** square tiles with a portrait, a gold border, a “3” prestige badge and their bonus requirements along the edge.
- **Table:** a dark, velvety table surface with soft vignette lighting; player areas arranged around the board on desktop, and a compact stacked layout on mobile.
- **Typography:** an elegant serif for titles and numbers, a clean sans for UI text.

### 4.2 Motion and Feedback

- Cards slide from deck to grid when dealt; bought cards fly to the buyer’s tableau; tokens arc from supply to hand.
- Subtle sound design (token clack, card flip, noble fanfare), all optional.
- Game animations must never block input longer than about 400 ms and should respect `prefers-reduced-motion`.

### 4.3 Accessibility

- Gems are distinguished by **color and a unique shape or symbol**, so the game is playable for color-blind players.
- Full keyboard navigation, visible focus states, ARIA labels on cards and tokens, and sufficient contrast.
- Responsive layout: desktop (primary), tablet, and phone in landscape and portrait.
- English only for v1; all text lives in one strings file so translation can be added later.

## 5. Architecture

### 5.1 Stack

- **Next.js (App Router) with TypeScript** for the UI, routing and static assets.
- **Custom Node server** (a `server.ts` that boots Next and attaches a WebSocket layer). Next.js route handlers alone do not host long-lived WebSocket connections well, so a custom server is the standard approach for a self-hosted realtime game.
- **Socket.IO** (or `ws`) for realtime messaging, with rooms mapped to games.
- **Tailwind CSS** plus **Framer Motion** for styling and animation; **Zustand** for client state.
- **Zod** for validating every inbound message.
- **SQLite** (via `better-sqlite3`) for snapshots and history.
- **Vitest** for engine unit tests, **Playwright** for end-to-end multiplayer tests.

### 5.2 Module Layout

- `/engine`: the pure rules engine, shared by server and tests. No dependency on Next.js or the network.
- `/server`: HTTP and WebSocket server, room manager, auth, rate limiting, persistence.
- `/app`: Next.js pages (home, create or join, lobby, game, history).
- `/components`: Card, Token, NobleTile, PlayerBoard, SupplyBoard, modals.
- `/data`: card and noble data files, with schema.
- `/assets`: SVG art, icons, sounds.

### 5.3 Authority and Sync Model

- The **server is authoritative**. Clients send *intents* (“I want to buy card X with this payment”); the server validates against the engine, applies, and broadcasts the new redacted view to each player.
- Clients never compute outcomes that other players rely on. Optimistic UI is allowed for animations only and is rolled back if the server rejects.
- Every action carries a monotonically increasing turn or version number to prevent replays and out-of-order messages.

## 6. Hosting and Sharing

### 6.1 Run Modes

- **Local only (default):** the server binds to `127.0.0.1`, reachable only from the host’s machine.
- **LAN mode:** an explicit flag binds to the local network for people in the same house.
- **Internet mode:** an explicit flag, plus mandatory password and TLS (see 6.2), for friends joining remotely.

One command should start everything (for example `npm run host`), and print the join link and room code.

### 6.2 Sharing Over the Internet with Tailscale

**Decision:** the game is shared with **Tailscale**. It builds a private, encrypted network between the host and invited friends, so no router port is opened and the host’s home IP address is never exposed to the public internet. Classic port forwarding is dropped for that reason.

- **Host setup:** install Tailscale on the host machine and keep the app listening on `127.0.0.1` only. Tailscale Serve publishes it over HTTPS (HTTPS is enabled once in the Tailscale admin console), which satisfies the `Secure` cookie and WSS requirements.
- **Inviting friends:** each friend installs Tailscale and receives access through device sharing, where the host shares only the game machine. Friends then open the HTTPS link, enter the room code and the room password.
- **Fallback:** Tailscale Funnel can expose the game publicly for a friend who cannot install Tailscale. Funnel is off by default and switched on per session, and then the room password, lockout and rate limits (section 7) carry the protection.
- **Not supported:** plain router port forwarding without TLS, because passwords and session tokens would cross the internet unencrypted.

The deliverables include a step-by-step Tailscale setup guide for the host and for friends.

## 7. Security Requirements

The host machine is exposed to strangers who may find the address, so these are requirements, not nice-to-haves.

### 7.1 Access Control

- **SEC-1** Every room is protected by a password chosen by the host. Passwords are never stored in plain text; store only a salted hash (argon2id, or scrypt as fallback).
- **SEC-2** A separate **host/admin secret** is set at startup (environment variable or generated on first run and printed once). Only the host can create rooms, kick players, or close the server’s rooms.
- **SEC-3** On successful join, the server issues a random 256-bit **session token** stored in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. It maps to a single seat. Tokens expire and can be revoked.
- **SEC-4** Room codes are long and unguessable (for example 8+ random characters), and rooms can be locked to stop new joins.
- **SEC-18** Only the single game machine is shared with friends through Tailscale, never the rest of the host’s network. Public Funnel mode is off by default and needs an explicit startup flag.

### 7.2 Abuse and Brute-Force Protection

- **SEC-5** Rate limiting per IP and per room on join attempts, with exponential backoff and temporary lockout after repeated wrong passwords.
- **SEC-6** Global connection limits, per-IP connection caps, per-message size limits, and a message rate limit per socket, to blunt denial-of-service attempts.
- **SEC-7** Idle rooms and stale sessions are cleaned up automatically.

### 7.3 Input and Transport Security

- **SEC-8** All inbound messages are schema-validated (Zod). Unknown fields are rejected, and no client value is trusted for game outcomes.
- **SEC-9** HTTPS/WSS only in internet mode (via Tailscale Serve, or Funnel in fallback mode). HSTS enabled.
- **SEC-10** WebSocket upgrades check the `Origin` header against an allow-list to prevent cross-site WebSocket hijacking; CORS is closed by default.
- **SEC-11** Strict security headers: Content-Security-Policy (no inline scripts, no third-party scripts), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors 'none'`.
- **SEC-12** User-supplied text (names, chat) is length-limited and always rendered as text, never as HTML, to prevent XSS.
- **SEC-13** The server exposes only the game port. There is no file browsing, no debug or admin endpoints without the admin secret, and the Node process runs as a non-privileged user, ideally in a container or with a restricted working directory.

### 7.4 Data and Privacy

- **SEC-14** No analytics or third-party calls. The app works fully offline apart from the player connections.
- **SEC-15** Logs record events without passwords, tokens or full IP addresses where possible, with rotation.
- **SEC-16** Secrets come from environment variables, never from the repository; `.env` is git-ignored.
- **SEC-17** Dependency hygiene: lockfile committed, `npm audit` in CI, and a minimal dependency list.

### 7.5 Threat Model Summary

- **Guessing the password or room code:** mitigated by long codes, hashing, rate limiting, lockout.
- **Cheating (seeing hidden cards, forging moves):** mitigated by server authority and redacted views.
- **Eavesdropping:** mitigated by mandatory TLS in internet mode.
- **Cross-site attacks:** mitigated by origin checks, cookie flags, CSP.
- **Flooding the host:** mitigated by rate and connection limits, and by Tailscale, which keeps the host IP hidden.
- **Compromise of the host machine:** mitigated by least privilege, a single exposed port, and not exposing anything beyond the app.

## 8. Non-Functional Requirements

- **Performance:** action round-trip under 150 ms on a normal home connection; smooth 60 fps animations on mid-range laptops and phones.
- **Capacity:** at least 3 concurrent 4-player games on a typical home machine.
- **Reliability:** state survives server restarts and brief client disconnects.
- **Browsers:** current versions of Chrome, Firefox, Safari and Edge, plus mobile Safari and Chrome.
- **Testing:** the engine reaches near-complete test coverage; at least one automated 4-player end-to-end game runs in CI; a fuzz test plays thousands of random legal games to confirm no crashes or invalid states.
- **Maintainability:** strict TypeScript, linting, formatting, and a short contributor README.

## 9. Delivery Plan

- **Milestone 0: Foundations.** Repo, Next.js app, custom server, lint/test setup, CI.
- **Milestone 1: Engine.** Full rules engine, card and noble data file, complete unit tests, random-play fuzzing. *Exit: engine can play full games headlessly.*
- **Milestone 2: Local playable UI.** Board, cards, tokens, nobles, player areas, hot-seat play on one screen with the real engine.
- **Milestone 3: Multiplayer.** Rooms, lobby, WebSocket sync, redacted views, reconnection, persistence.
- **Milestone 4: Security hardening.** Password hashing, session cookies, rate limiting, origin checks, headers, a Tailscale setup guide, a security review checklist.
- **Milestone 5: Visual polish.** Final card and token art, animation, sound, accessibility pass, mobile layout.
- **Milestone 6: Release candidate.** Playtest with real friends over the internet, fix issues, write the host guide.

Post-v1 ideas: spectator mode improvements, the Cities of Splendor expansion, game replays, and ratings.

## 10. Decisions

1. **Card data:** sourced from published online lists, cross-checked against at least two independent sources, and reviewed card by card (FR-23).
2. **Art:** clean, original vector (SVG) design.
3. **Sharing:** Tailscale (section 6.2).
4. **Edge-case rulings:** the recommended decisions in section 2.5 are accepted.
5. **Scope:** no bots; only real people play together. Text chat is included, and spectators stay optional and off by default, unless you say otherwise.
6. **Language:** English only.

## Sources

- RulesPal, “Splendor Rulebook” (setup, turn actions, reserving, buying, nobles, end of game).
- Space Cowboys, Splendor 10th Anniversary Edition rulebook (components and official edition details).
- Official Game Rules and Boardgame Capital summaries (player count, play time, general overview).
