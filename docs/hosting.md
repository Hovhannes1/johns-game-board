# Hosting & Playing Online

## Hosting a game
1. Open the site and pick **Splendor → Host an online game** (or go to `/splendor/host/`).
2. Choose a room name, your display name, seat color, and game settings. Optionally set a room password (off by default — the 10-character code in the invite link is already a ~49-bit secret).
3. Click **Create room**. Copy the invite link (`/splendor/play/#CODE`) and send it to friends.
4. **Keep your host browser tab open** while playing. Your browser runs the authoritative rules engine and saves progress to IndexedDB after every move.
5. If you accidentally close or refresh the host tab, reopen the same link (or click **Resume** on the gallery / host page) — the room is restored from IndexedDB and friends automatically reconnect.

## Joining a game
- Paste the invite link or 10-character room code into **Join with code** on the gallery or Splendor page.
- Refreshing your browser tab keeps your seat automatically via a per-room `clientKey` stored in `localStorage`.

## NAT / Firewall troubleshooting
- The Splendor home page runs a quick pre-flight STUN check.
- If a strict corporate/mobile CGNAT network blocks direct UDP connections and no TURN relay is configured, switch to another network or disable VPNs.
- Repository owners can configure a free-tier TURN relay (e.g. Metered or Cloudflare Realtime TURN) via GitHub Actions repository secrets:
  - `NEXT_PUBLIC_TURN_URL`
  - `NEXT_PUBLIC_TURN_USERNAME`
  - `NEXT_PUBLIC_TURN_CREDENTIAL`
