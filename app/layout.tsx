import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { strings } from '@/games/splendor/lib/strings';
import './globals.css';

export const metadata: Metadata = {
  title: strings.appName,
  description: strings.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b0f0d',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the request makes every page render per request, which the CSP
  // nonce needs (proxy.ts); Next.js applies the nonce to its own scripts.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" data-csp={nonce ? 'nonce' : undefined}>
      <body>{children}</body>
    </html>
  );
}
