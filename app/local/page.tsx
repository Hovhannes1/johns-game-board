import type { Metadata } from 'next';
import { LocalGame } from '@/components/local/LocalGame';
import { strings } from '@/lib/strings';

export const metadata: Metadata = { title: `${strings.home.hotseat} · ${strings.appName}` };

export default function LocalPage() {
  return <LocalGame />;
}
