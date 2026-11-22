import type { Metadata } from 'next';
import { CreateRoomForm } from '@/components/online/CreateRoomForm';
import { online, strings } from '@/games/splendor/lib/strings';

export const metadata: Metadata = { title: `${online.host.title} · ${strings.appName}` };

export default function SplendorHostPage() {
  return <CreateRoomForm gameId="splendor" />;
}
