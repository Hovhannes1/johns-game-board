import type { Metadata } from 'next';
import { OnlineRoom } from '@/components/online/OnlineRoom';
import { strings } from '@/games/splendor/lib/strings';

export const metadata: Metadata = { title: strings.appName };

export default function SplendorPlayPage() {
  return <OnlineRoom gameId="splendor" />;
}
