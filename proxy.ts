import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Strict Content-Security-Policy with a fresh nonce per page (SEC-11): only
 * scripts carrying the nonce run, so injected markup cannot execute code.
 * Styles allow inline attributes (React style props), never inline scripts.
 *
 * x-forwarded-proto is trustworthy here: the custom server strips forwarded
 * headers from anything that did not come through the local Tailscale proxy.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV === 'development';
  const host = request.headers.get('host') ?? '';
  const https = request.headers.get('x-forwarded-proto') === 'https' || host.endsWith('.ts.net');
  const socketOrigin = `${https ? 'wss' : 'ws'}://${host}`;

  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${socketOrigin}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|socket.io).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
