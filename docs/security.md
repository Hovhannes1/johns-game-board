# Security & Trust Model (Serverless P2P)

## What is verified
- **Strict schema validation**: Every inbound WebRTC envelope is size-capped (`16 KB`) and validated with `zod` before reaching `HostRoomManager`.
- **Rules & turn authority**: The host's `HostRuntime` runs the pure `GameModule` engine and rejects out-of-turn, illegal, or stale-version intents (`STALE_VERSION`).
- **Redacted client views**: Non-host peers only ever receive `getPublicView(state, viewerId)` — deck order and opponents' blind reserves are never sent to clients.
- **Encrypted signaling**: Trystero encrypts SDP offers/answers and ICE candidates using the 10-character room code (`#hash`, which is never sent in HTTP requests to GitHub Pages).
- **Rate limiting**: Per-peer `TokenBucket` limits message and chat bursts, and `FailureLockout` applies exponential backoff to wrong room passwords.

## Trade-offs of browser-hosted P2P
- **Host trust**: Because the host's browser holds the full `GameState` (including the RNG seed and deck order), a host inspecting DevTools memory could see hidden cards. This model is intended for friendly games.
- **Peer IP visibility**: Direct WebRTC connections expose peers' IP addresses to each other (standard for WebRTC unless forced through a TURN relay).
- **Public TURN credentials**: Any `NEXT_PUBLIC_TURN_*` credentials embedded in a static GitHub Pages bundle are readable by visitors; use a quota-limited free-tier account.
