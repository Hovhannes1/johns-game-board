import type { Metadata } from 'next';
import { OnlineRoom } from '@/components/online/OnlineRoom';
import { strings } from '@/games/bazar-blot/lib/strings';

export const metadata: Metadata = { title: strings.appName };

export default function BazarBlotPlayPage() {
  return <OnlineRoom gameId="bazar-blot" />;
}
