# Security review checklist

How each requirement in spec section 7 is met, where it lives, and how it is verified. Items marked
**manual** need a person to check them on the host machine before each release.

| ID | Requirement | Implementation | Verified by |
| --- | --- | --- | --- |
| SEC-1 | Room passwords hashed | argon2id (m=19 MiB, t=2, p=1) via `node:crypto`, scrypt fallback, PHC strings. `server/security/passwords.ts` | `server/rooms.test.ts` |
| SEC-2 | Host/admin secret | `SPLENDOR_ADMIN_SECRET`, or generated on first run, printed once, stored as an argon2id hash in `var/admin-secret.hash`. Only admins create, lock and close rooms; only the room host kicks or starts. `server/admin-secret.ts`, `server/api.ts` | `server/multiplayer.test.ts` |
| SEC-3 | Session tokens | 256-bit random tokens in `HttpOnly; SameSite=Strict` cookies, `__Host-` prefix and `Secure` on HTTPS; stored only as SHA-256 hashes; sliding expiry (3 days seat, 12 h admin); revoked on kick, leave and room close. `server/sessions.ts`, `server/http-guard.ts` | `server/config.test.ts`, `server/multiplayer.test.ts` |
| SEC-4 | Unguessable codes, lockable rooms | 10 characters from a 31-symbol alphabet (about 49.5 bits), crypto RNG with rejection sampling; host lock blocks new joins. `server/security/tokens.ts` | `server/rooms.test.ts`, `server/multiplayer.test.ts` |
| SEC-5 | Brute-force protection | Per-IP and per-room exponential lockouts on join, per-IP and global lockouts on host login, identical responses and timing for unknown rooms and wrong passwords. `server/api.ts`, `server/security/rate-limit.ts` | `server/multiplayer.test.ts`, `server/rooms.test.ts` |
| SEC-6 | DoS limits | 200 sockets total, 16 per IP, 8 KB message cap, per-socket token buckets (moves and chat) with disconnect after repeated floods, 8 KB API bodies, request and header timeouts, 40 API requests per IP burst. `server/realtime.ts`, `server/app.ts` | code review (**manual**) |
| SEC-7 | Cleanup | Housekeeping every 10 minutes: expired sessions, idle rooms (6 h lobby, 3 days game), rate-limit state. `server/app.ts`, `server/rooms.ts` | `server/rooms.test.ts` |
| SEC-8 | Validate every message | Strict Zod schemas for every API body and socket event, unknown fields rejected, the engine re-validates every move. `lib/protocol.ts` | `server/multiplayer.test.ts` |
| SEC-9 | HTTPS in internet mode, HSTS | TLS by Tailscale Serve/Funnel; HSTS on HTTPS requests; `upgrade-insecure-requests` in the CSP on HTTPS. `server/http-guard.ts`, `proxy.ts` | **manual**: open the ts.net URL and check the headers |
| SEC-10 | Origin checks, CORS closed | WebSocket handshakes and API writes require an allow-listed `Origin`; WebSocket-only transport; no CORS headers. `server/http-guard.ts`, `server/realtime.ts` | `server/config.test.ts`, `server/multiplayer.test.ts`, `e2e/security.spec.ts` |
| SEC-11 | Security headers | Nonce-based CSP with `strict-dynamic` (no inline scripts without the nonce), `frame-ancestors 'none'`, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options, COOP/CORP; API responses use `default-src 'none'`. `proxy.ts`, `next.config.ts`, `server/api.ts` | `e2e/security.spec.ts` |
| SEC-12 | Text is length-limited and rendered as text | Names 20, room names 40, chat 200 characters, control characters stripped; React renders text only (no `dangerouslySetInnerHTML`). `lib/protocol.ts` | `server/multiplayer.test.ts`, `e2e/online.spec.ts` |
| SEC-13 | Single port, no debug endpoints, least privilege | One HTTP port; Host header allow-list (DNS rebinding); no admin endpoints without the host secret; the art route serves exactly four named images (no listing, no other paths); warning when started as root. **Manual**: run as a normal user account. `server/http-guard.ts`, `server/art.ts`, `server/index.ts` | `server/config.test.ts`, `server/art.test.ts` |
| SEC-14 | No analytics or third-party calls | No external scripts, fonts or images (enforced by CSP); Next.js telemetry disabled for build and runtime. `scripts/next-build.mjs`, `server/index.ts` | `e2e/security.spec.ts` |
| SEC-15 | Safe logs | JSON lines in `var/logs`, 14-day rotation, keys like password/secret/token/cookie/seed redacted, IPs truncated. `server/logger.ts` | `server/logger.test.ts` |
| SEC-16 | Secrets from the environment | `.env` loaded at startup and git-ignored; `.env.example` has no values. | **manual**: `git status` shows no `.env` |
| SEC-17 | Dependency hygiene | Exact versions, lockfile, `npm audit` in CI, minimal runtime dependencies (no native add-ons: SQLite and argon2 come from Node). | CI |
| SEC-18 | Share one machine; Funnel off by default | Tailscale device sharing plus the grant in `docs/hosting.md`; the server refuses `*.ts.net` traffic without Tailscale identity headers (public Funnel) unless started with `--funnel`, and refuses `*.ts.net` Host headers that did not come through the local Tailscale proxy. | `server/config.test.ts`, **manual**: Access controls rule in place |

## Before each release (manual)

- [ ] `npm run check`, `npm run build` and `npm run test:e2e` pass; `npm audit` is clean.
- [ ] The host account running the server is a normal user, not an administrator.
- [ ] The Tailscale Access controls rule limits shared users to port 443.
- [ ] Opening `https://<machine>.<tailnet>.ts.net` shows a valid certificate and an HSTS header.
- [ ] Funnel is off (`tailscale funnel status`) unless deliberately enabled for one session.
- [ ] `var/` (database, logs, host secret hash) is not inside a synced or shared folder.
