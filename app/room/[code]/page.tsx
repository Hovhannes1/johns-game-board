import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OnlineRoom } from '@/components/online/OnlineRoom';
import { roomCode } from '@/lib/protocol';
import { strings } from '@/games/splendor/lib/strings';

export const metadata: Metadata = { title: strings.appName };

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const parsed = roomCode.safeParse((await params).code);
  if (!parsed.success) notFound();
  return <OnlineRoom code={parsed.data} />;
}
