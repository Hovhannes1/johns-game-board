# Splendor Online

Self-hosted, real-time Splendor for playing with friends. See
[the product and technical spec](./Splendor%20Online%20Product%20and%20Technical%20Spec%20(v0.1).md).

- **Online play:** the host creates a password-protected room, friends join through Tailscale and
  play live from any browser. Guide: [docs/hosting.md](docs/hosting.md).
- **Hot-seat:** 2 to 4 players on one screen, from the home page.
- **Security:** see [docs/security.md](docs/security.md) for how each requirement is met.

## Quick start

Requires Node.js 24 or newer.

```sh
npm install
npm run dev     # development server with hot reload on http://127.0.0.1:3000
npm run host    # production build + start; prints the friend link and host page
```

The server binds to `127.0.0.1` only. `npm run start -- --lan` exposes it on the local network.
Configuration lives in `.env` (copy `.env.example`); never commit it. Runtime data (SQLite
database, logs, hashed host secret) is written to `var/`.

## Scripts

| Command                       | What it does                                                   |
| ----------------------------- | -------------------------------------------------------------- |
| `npm test`                    | Unit and multiplayer tests, plus 1,000 fuzzed games (`FUZZ_GAMES=n`) |
| `npm run test:coverage`       | Tests with coverage thresholds for `engine/` and `data/`       |
| `npm run test:e2e`            | Playwright browser tests; run `npm run build` first            |
| `npm run check`               | Format check, lint, typecheck and unit tests                   |
| `npm run admin:reset`         | Forget the host secret; a new one is printed on next start     |
| `npm run data:import-sources` | Re-download the published card lists into `data/sources`       |
| `npm run data:build-pack`     | Cross-check sources and regenerate `data/packs/base.json`      |

Browser tests need Chromium once: `npx playwright install chromium`. To load a mid-game hot-seat
position, `npx tsx scripts/make-saved-game.ts 3 40 5a save.json` writes a save for the
`splendor-hotseat` localStorage key.

## Layout

- `engine/`: pure rules engine (no I/O, no framework). Entry point `engine/index.ts`.
- `data/`: card packs (`packs/base.json`), schema, and the normalized source lists used for the cross-check.
- `server/`: custom Node server: HTTP guard, JSON API (`api.ts`), Socket.IO (`realtime.ts`), rooms
  and the authoritative game (`rooms.ts`), sessions, SQLite persistence (`db.ts`), logging.
- `lib/protocol.ts`: wire protocol and Zod schemas shared by server and browser.
- `app/`: routes: `/`, `/host`, `/join/[code]`, `/room/[code]`, `/history`, `/local`. `proxy.ts` sets the CSP.
- `components/art/`: original SVG art. `components/game/`: the table, which renders any player's
  redacted `GameView`. `components/online/`: host page, join form, lobby, chat.
- `stores/`: client state (Zustand). `lib/strings.ts`: all UI text.
- `e2e/`: Playwright tests. `scripts/`: build, card data import, dev helpers.

## Engine rulings

Beyond the decisions in spec section 2.5:

- If every player passes in a row (only possible when no one has any legal action), the game ends
  and is scored normally, since the position can never change again. A noble visit resets the count.
- A player over the token limit returns exactly enough tokens to get back to 10.
- Card payment is computed by the engine (bonuses, then gems, then gold); players do not choose
  to spend gold instead of gems.
- When a turn timer runs out, or a disconnected player is auto-skipped, the server plays the least
  intrusive legal move: take gems, otherwise reserve blind, otherwise buy, otherwise pass.

## Artwork

Settings (in game) switches between **Minimal (vector)** art, drawn in code, and **Illustrated
(images)**, which uses the strips in `assets/` served at `/art/*.jpg`:

| File         | Tiles | Order                                                          |
| ------------ | ----- | -------------------------------------------------------------- |
| `cards.jpg`  | 15    | 3 per gem (level I, II, III): onyx, sapphire, diamond, emerald, ruby |
| `chips.jpg`  | 6     | onyx, sapphire, diamond, emerald, ruby, gold                    |
| `deck.jpg`   | 3     | card backs for level I, II, III                                |
| `nobles.jpg` | 10    | portraits for nobles N01 to N10                                |

Replace a file with another strip of the same layout to restyle the game; the mapping lives in
`components/art/sprites.ts`. If a file is missing, the vector art shows instead. The images are for
private play: they are not original art, so keep them out of public repositories and public
(Funnel) hosting.

## Implementation notes

- Persistence uses Node's built-in `node:sqlite` instead of `better-sqlite3`, and password hashing
  uses Node's built-in argon2id, so there are no native add-ons to compile.
- Animations use the `motion` library; sounds are synthesized with Web Audio (no audio files).

## Card data

`data/packs/base.json` is generated from three independent published card lists and only written when
all of them agree. Its `provenance.review` field stays `pending` until someone has checked it card by
card against a physical copy (FR-23).
