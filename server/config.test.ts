import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { loadConfig, normalizeOrigin, withOrigins } from './config';
import {
  cookieName,
  guardRequest,
  isOriginAllowed,
  readCookies,
  serializeCookie,
} from './http-guard';

function req(headers: Record<string, string>, remoteAddress = '127.0.0.1'): IncomingMessage {
  return { headers: { ...headers }, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe('server config (6.1)', () => {
  it('binds to 127.0.0.1 by default', () => {
    const config = loadConfig([], {});
    expect(config).toMatchObject({
      mode: 'local',
      host: '127.0.0.1',
      port: 3000,
      dev: false,
      allowFunnel: false,
    });
    expect([...config.allowedOrigins]).toEqual(['http://127.0.0.1:3000', 'http://localhost:3000']);
    expect([...config.allowedHosts]).toEqual(['127.0.0.1:3000', 'localhost:3000']);
  });

  it('only binds to all interfaces when LAN mode is explicit', () => {
    expect(loadConfig(['--lan'], {}).host).toBe('0.0.0.0');
    expect(loadConfig([], { SPLENDOR_MODE: 'lan' }).host).toBe('0.0.0.0');
    expect(() => loadConfig([], { SPLENDOR_MODE: 'internet' })).toThrow(/SPLENDOR_MODE/);
  });

  it('reads the port from flags or env and validates it', () => {
    expect(loadConfig(['--port', '4123'], {}).port).toBe(4123);
    expect(loadConfig([], { SPLENDOR_PORT: '5000' }).port).toBe(5000);
    expect(() => loadConfig(['--port', '70000'], {})).toThrow(/port/);
    expect(() => loadConfig([], { SPLENDOR_PORT: 'abc' })).toThrow(/port/);
  });

  it('adds extra allowed origins, normalized, and their hosts', () => {
    const config = loadConfig([], {
      SPLENDOR_ALLOWED_ORIGINS: ' https://gamebox.example.ts.net/ , https://other.example:8443',
    });
    expect(config.allowedOrigins.has('https://gamebox.example.ts.net')).toBe(true);
    expect(config.allowedHosts.has('gamebox.example.ts.net')).toBe(true);
    expect(config.allowedHosts.has('other.example:8443')).toBe(true);
    expect(() => loadConfig([], { SPLENDOR_ALLOWED_ORIGINS: 'ftp://x' })).toThrow(/origin/);
    const more = withOrigins(loadConfig([], {}), ['https://box.tail1.ts.net']);
    expect(more.allowedHosts.has('box.tail1.ts.net')).toBe(true);
  });

  it('enables Funnel only explicitly and validates the admin secret', () => {
    expect(loadConfig(['--funnel'], {}).allowFunnel).toBe(true);
    expect(loadConfig([], { SPLENDOR_ALLOW_FUNNEL: '1' }).allowFunnel).toBe(true);
    expect(() => loadConfig([], { SPLENDOR_ADMIN_SECRET: 'short' })).toThrow(/12/);
    expect(loadConfig([], { SPLENDOR_ADMIN_SECRET: 'a-long-enough-secret' }).adminSecret).toBe(
      'a-long-enough-secret',
    );
  });

  it('normalizes origins', () => {
    expect(normalizeOrigin('HTTPS://Example.com:443/path')).toBe('https://example.com');
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull();
    expect(normalizeOrigin('not a url')).toBeNull();
  });
});

describe('request guard', () => {
  const config = withOrigins(loadConfig([], {}), ['https://gamebox.tail1.ts.net']);

  it('rejects unknown Host headers (DNS rebinding)', () => {
    expect(guardRequest(req({ host: 'evil.example' }), config)).toMatchObject({
      ok: false,
      status: 421,
    });
    expect(guardRequest(req({ host: '127.0.0.1:3000' }), config)).toMatchObject({ ok: true });
  });

  it('trusts Tailscale Serve headers only from loopback', () => {
    const viaServe = guardRequest(
      req({
        host: 'gamebox.tail1.ts.net',
        'x-forwarded-for': '100.64.0.7',
        'tailscale-user-login': 'friend@example.com',
      }),
      config,
    );
    expect(viaServe).toMatchObject({
      ok: true,
      ctx: { ip: '100.64.0.7', secure: true, tailnetUser: 'friend@example.com' },
    });
    // A LAN client cannot pretend to be tailnet traffic.
    expect(
      guardRequest(req({ host: 'gamebox.tail1.ts.net' }, '192.168.1.20'), config),
    ).toMatchObject({
      ok: false,
      status: 403,
    });
    const spoof = req({ host: '127.0.0.1:3000', 'x-forwarded-for': '1.2.3.4' }, '192.168.1.20');
    const result = guardRequest(spoof, config);
    expect(result).toMatchObject({ ok: true, ctx: { ip: '192.168.1.20', secure: false } });
    expect(spoof.headers['x-forwarded-for']).toBeUndefined();
  });

  it('refuses public Funnel traffic unless allowed (SEC-18)', () => {
    const funnel = req({ host: 'gamebox.tail1.ts.net', 'x-forwarded-for': '203.0.113.9' });
    expect(guardRequest(funnel, config)).toMatchObject({ ok: false, status: 403 });
    expect(guardRequest(funnel, { ...config, allowFunnel: true })).toMatchObject({ ok: true });
  });

  it('checks Origin against the allow-list (SEC-10)', () => {
    expect(isOriginAllowed(req({ origin: 'https://gamebox.tail1.ts.net' }), config)).toBe(true);
    expect(isOriginAllowed(req({ origin: 'http://localhost:3000' }), config)).toBe(true);
    expect(isOriginAllowed(req({}), config)).toBe(false);
    expect(isOriginAllowed(req({ origin: 'https://evil.example' }), config)).toBe(false);
    expect(isOriginAllowed(req({ origin: 'http://localhost:3000.evil.example' }), config)).toBe(
      false,
    );
    expect(isOriginAllowed(req({ origin: 'null' }), config)).toBe(false);
  });
});

describe('session cookies (SEC-3)', () => {
  it('uses __Host- cookies with Secure on HTTPS', () => {
    expect(cookieName('seat', true)).toBe('__Host-splendor-seat');
    expect(serializeCookie('seat', 'abc', true, 60)).toBe(
      '__Host-splendor-seat=abc; Path=/; HttpOnly; SameSite=Strict; Max-Age=60; Secure',
    );
    expect(serializeCookie('admin', 'x', false, 10)).toBe(
      'splendor-admin=x; Path=/; HttpOnly; SameSite=Strict; Max-Age=10',
    );
  });

  it('parses cookie headers', () => {
    expect(readCookies(req({ cookie: 'a=1; splendor-seat=tok%20en; a=2' }))).toEqual({
      a: '1',
      'splendor-seat': 'tok en',
    });
  });
});
