/**
 * Per-request checks shared by HTTP and WebSocket traffic:
 * - Host allow-list (DNS rebinding protection, SEC-13)
 * - forwarded and Tailscale identity headers are trusted only from the local
 *   Tailscale Serve proxy (loopback); anyone else's copies are stripped
 * - public Funnel traffic is refused unless explicitly enabled (SEC-18)
 * - HSTS on HTTPS (SEC-9)
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerConfig } from './config';
import { normalizeOrigin } from './config';

export interface RequestContext {
  /** Best-known client address (tailnet IP behind Serve). */
  ip: string;
  /** The browser reached us over HTTPS (through Tailscale Serve). */
  secure: boolean;
  host: string;
  /** Tailscale login of the visitor when they came through Serve. */
  tailnetUser: string | null;
}

export type GuardResult =
  { ok: true; ctx: RequestContext } | { ok: false; status: number; reason: string };

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function guardRequest(req: IncomingMessage, config: ServerConfig): GuardResult {
  const remote = req.socket.remoteAddress ?? '';
  const fromLocalProxy = LOOPBACK.has(remote);
  const host = (header(req, 'host') ?? '').toLowerCase();

  if (!config.allowedHosts.has(host)) {
    return { ok: false, status: 421, reason: 'Unknown host' };
  }

  const viaTailscale = host.endsWith('.ts.net');
  if (!fromLocalProxy) {
    // Only the local Tailscale daemon may speak for tailnet traffic.
    if (viaTailscale) return { ok: false, status: 403, reason: 'Forbidden' };
    for (const name of Object.keys(req.headers)) {
      if (name.startsWith('x-forwarded-') || name.startsWith('tailscale-'))
        delete req.headers[name];
    }
  }

  const forwardedFor = fromLocalProxy
    ? header(req, 'x-forwarded-for')?.split(',')[0]?.trim()
    : undefined;
  const tailnetUser = fromLocalProxy ? (header(req, 'tailscale-user-login') ?? null) : null;
  const proto = fromLocalProxy ? header(req, 'x-forwarded-proto') : undefined;

  // Serve adds identity headers for tailnet visitors; public Funnel traffic has none.
  if (viaTailscale && !tailnetUser && !config.allowFunnel) {
    return { ok: false, status: 403, reason: 'Public access is disabled on this server' };
  }

  return {
    ok: true,
    ctx: {
      ip: forwardedFor || remote,
      secure: fromLocalProxy && (proto === 'https' || viaTailscale),
      host,
      tailnetUser,
    },
  };
}

export function isOriginAllowed(req: IncomingMessage, config: ServerConfig): boolean {
  const raw = header(req, 'origin');
  if (!raw) return false;
  const origin = normalizeOrigin(raw);
  return origin !== null && config.allowedOrigins.has(origin);
}

export function applyTransportHeaders(res: ServerResponse, ctx: RequestContext): void {
  if (ctx.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

export function sendText(res: ServerResponse, status: number, text: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(text);
}

// ---------------------------------------------------------------------------
// Cookies (SEC-3)
// ---------------------------------------------------------------------------

export type CookieKind = 'seat' | 'admin';

/** `__Host-` cookies must be Secure, host-only and Path=/; used whenever we are on HTTPS. */
export function cookieName(kind: CookieKind, secure: boolean): string {
  return secure ? `__Host-splendor-${kind}` : `splendor-${kind}`;
}

export function readCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key && !(key in out)) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function readSessionCookie(
  req: IncomingMessage,
  kind: CookieKind,
  secure: boolean,
): string | undefined {
  return readCookies(req)[cookieName(kind, secure)];
}

export function serializeCookie(
  kind: CookieKind,
  value: string,
  secure: boolean,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${cookieName(kind, secure)}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function appendSetCookie(res: ServerResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie');
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}
