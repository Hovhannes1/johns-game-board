import type { Metadata } from 'next';
import { HistoryList } from '@/components/online/HistoryList';
import { strings } from '@/games/bazar-blot/lib/strings';

export const metadata: Metadata = { title: `History — ${strings.appName}` };

export default function BazarBlotHistoryPage() {
  return <HistoryList gameId="bazar-blot" />;
}
