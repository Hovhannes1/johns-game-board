import type { Metadata } from 'next';
import { CreateRoomForm } from '@/components/online/CreateRoomForm';
import { strings } from '@/games/bazar-blot/lib/strings';

export const metadata: Metadata = { title: `Host — ${strings.appName}` };

export default function BazarBlotHostPage() {
  return <CreateRoomForm gameId="bazar-blot" />;
}
