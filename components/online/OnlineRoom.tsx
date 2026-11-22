'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { GameTable } from '@/games/splendor/components/game/GameTable';
import { online } from '@/games/splendor/lib/strings';
import { useOnline } from '@/stores/online';
import { ChatPanel } from './ChatPanel';
import { Lobby } from './Lobby';

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

/** A room page: connects to the server and shows the lobby or the table. */
export function OnlineRoom({ code }: { code: string }) {
  const router = useRouter();
  const { status, endReason, room, view, chat, clockOffset, connect, disconnect, intent, send } =
    useOnline();

  useEffect(() => {
    connect(code);
    return () => disconnect();
  }, [code, connect, disconnect]);

  useEffect(() => {
    // No seat for this room in this browser: go join it.
    if (status === 'unauthorized') router.replace(`/join/${code}`);
  }, [status, code, router]);

  const presence = useMemo(
    () => new Map(room?.members.map((m) => [m.id, m.connected]) ?? []),
    [room?.members],
  );

  if (status === 'ended') {
    return (
      <Centered>
        <p role="alert" className="font-display text-2xl">
          {online.ended[endReason ?? 'expired']}
        </p>
        <Link href="/" className="text-brass underline-offset-4 hover:underline">
          {online.ended.home}
        </Link>
      </Centered>
    );
  }

  if (!room) {
    return (
      <Centered>
        <p role="status">
          {status === 'reconnecting'
            ? online.connection.reconnecting
            : online.connection.connecting}
        </p>
      </Centered>
    );
  }

  const chip =
    status === 'reconnecting' ? (
      <span role="status" className="rounded-full bg-gem-ruby/80 px-2.5 py-0.5 text-xs text-white">
        {online.connection.reconnecting}
      </span>
    ) : null;

  if (room.status === 'lobby' || !view) {
    return <Lobby room={room} chat={chat} onLeft={() => router.push('/')} />;
  }

  const isHost = room.me.isHost;
  return (
    <main>
      <GameTable
        view={view}
        onIntent={intent}
        presence={presence}
        turnDeadline={room.turnDeadline}
        clockOffset={clockOffset}
        statusChip={chip}
        side={<ChatPanel messages={chat} />}
        onPlayAgain={isHost ? () => void send('host:playAgain', {}) : undefined}
        endNote={isHost ? undefined : online.table.waitingForHost}
        onExit={() => router.push('/')}
        exitCopy={{
          title: online.table.exitTitle,
          body: online.table.exitBody,
          confirm: online.table.exitConfirm,
        }}
      />
    </main>
  );
}
