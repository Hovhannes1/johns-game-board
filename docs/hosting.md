# Hosting Splendor Online for friends

The game runs on your computer and is shared privately over [Tailscale](https://tailscale.com).
No router ports are opened and your home IP address is never exposed. Friends need a free
Tailscale account and an invite to your machine.

## One-time setup (host)

1. **Install** Node.js 24 or newer, then in the project folder run `npm install`.
2. **Install Tailscale** on the game computer and sign in. On Windows the `tailscale` command is
   at `C:\Program Files\Tailscale\tailscale.exe`; open a new terminal after installing so it is on
   your PATH.
3. **Rename the machine** in the [admin console](https://login.tailscale.com/admin/machines) to
   something neutral such as `gamebox`. Machine names appear in public certificate logs once
   HTTPS is enabled, so avoid personal details.
4. **Restrict what friends can reach.** On the Access controls page, use rules like these so
   shared users can only reach the HTTPS game port:

   ```json
   "grants": [
     { "src": ["autogroup:member"], "dst": ["*"], "ip": ["*"] },
     { "src": ["autogroup:shared"], "dst": ["*"], "ip": ["443"] }
   ]
   ```

5. **Optional `.env`.** Copy `.env.example` to `.env`. The server detects your Tailscale address
   automatically; set `SPLENDOR_ALLOWED_ORIGINS` only if you serve it under another name.

## Each game night (host)

```powershell
npm run host                 # builds and starts on 127.0.0.1:3000
tailscale serve --bg 3000    # publish over HTTPS to your tailnet (stays on until reset)
```

The console prints the friend link (for example `https://gamebox.tail1234.ts.net`) and the
**host page**. The first time the server starts it also prints a **host secret** once. Save it in a
password manager. If you lose it, run `npm run admin:reset` and restart to get a new one.

Then:

1. Open the host page (`/host`), log in with the host secret.
2. Create a room: name, room password, your name and color, and settings (players, turn timer,
   seat order, first player, spectators, auto-play for disconnected players).
3. The console prints the room code and invite link. Send friends the **link** and, separately,
   the **room password**.
4. When everyone shows "Ready" in the lobby, press **Start game**.

Keep the computer awake while you play. Games are saved after every move, so a restart or a
crash only pauses the game: run `npm run start` again and everyone reloads their page.

To stop sharing: `tailscale serve reset`.

## Friends

1. Install Tailscale on your phone or computer and sign in (Google, Microsoft, Apple, GitHub or a
   passkey all work).
2. Accept the host's **share invite** (the host sends it from the admin console: machine menu,
   **Share**).
3. With Tailscale connected, open the invite link, enter the room password, pick a name and a
   color, and press **I'm ready**.

If you lose connection, just reload: your seat is kept in this browser for three days. The host
can remove a player; mid-game, that seat opens for someone else to take over.

## Optional: a friend who cannot install Tailscale

Tailscale Funnel can publish the game on the public internet. It is off by default and the
server refuses public traffic unless started with the `--funnel` flag:

```powershell
npm run start -- --funnel
tailscale funnel --bg 3000
```

Anyone who finds the address can then reach the join page, so use a strong room password, lock
the room once everyone is in, and turn Funnel off afterwards (`tailscale funnel reset`). Wrong
passwords trigger lockouts and every request is rate limited.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `tailscale` is not recognized | Open a new terminal, or use the full path above. |
| Home page says "Not connected to the game server" | The address is not allowed: restart the server so it re-detects Tailscale, or add it to `SPLENDOR_ALLOWED_ORIGINS`. |
| "Public access is disabled on this server" | You are using Funnel without `--funnel`, or the visitor is not on your tailnet. |
| Friend cannot open the link at all | Their Tailscale is off, or they have not accepted the share. Check the Access controls rules. |
| "Too many attempts" | Wait for the lockout shown, then try the correct password. |
| Console says Tailscale Serve is not forwarding | Run `tailscale serve --bg 3000` (use the port the server prints). |
