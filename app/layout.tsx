import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { strings } from '@/games/splendor/lib/strings';
import './globals.css';

export const metadata: Metadata = {
  title: "John's Game Board",
  description: strings.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b0f0d',
  width: 'device-width',
  initialScale: 1,
};

const STATIC_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' wss: https:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={STATIC_CSP} />
      </head>
      <body>{children}</body>
    </html>
  );
}
