import type { Metadata } from 'next';
import { LocalGame } from '@/games/splendor/components/local/LocalGame';
import { strings } from '@/games/splendor/lib/strings';

export const metadata: Metadata = { title: `${strings.home.hotseat} · ${strings.appName}` };

export default function SplendorLocalPage() {
  return <LocalGame />;
}
