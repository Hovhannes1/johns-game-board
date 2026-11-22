import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JoinForm } from '@/components/online/JoinForm';
import { roomCode } from '@/lib/protocol';
import { online, strings } from '@/games/splendor/lib/strings';

export const metadata: Metadata = { title: `${online.join.titleGeneric} · ${strings.appName}` };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const parsed = roomCode.safeParse((await params).code);
  if (!parsed.success) notFound();
  return <JoinForm code={parsed.data} />;
}
