'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { OnlineTableProps } from '@/platform/games/table';
import { GameTable } from '@/games/splendor/components/game/GameTable';
import { gameTables } from './game-tables';
import { online } from '@/games/splendor/lib/strings';
import { roomCode } from '@/lib/protocol';
import { BrowserRoomStore } from '@/platform/room/browser-store';
import { useOnline } from '@/stores/online';
import { ChatPanel } from './ChatPanel';
import { JoinForm } from './JoinForm';
import { Lobby } from './Lobby';

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

/**
 * A P2P room page: reads the room code from `location.hash` (or an explicit
 * `code` prop), resumes hosting if this browser owns the room in IndexedDB,
 * or connects as a WebRTC peer.
 */
export function OnlineRoom({
  code: propCode,
  gameId = 'splendor',
}: {
  code?: string;
  gameId?: string;
}) {
  const router = useRouter();
  const [resolvedCode, setResolvedCode] = useState<string | null>(() => {
    if (!propCode) return null;
    const parsed = roomCode.safeParse(propCode);
    return parsed.success ? parsed.data : null;
  });
  const [invalidCode, setInvalidCode] = useState(false);

  const {
    status,
    icePath,
    isHosting,
    joining,
    endReason,
    room,
    view,
    chat,
    clockOffset,
    resumeHost,
    connectClient,
    disconnect,
    intent,
    send,
  } = useOnline();

  useEffect(() => {
    if (propCode) return;
    const syncHash = () => {
      const raw = window.location.hash.replace(/^#/, '');
      const parsed = roomCode.safeParse(raw);
      if (parsed.success) {
        setResolvedCode(parsed.data);
        setInvalidCode(false);
      } else {
        setResolvedCode(null);
        setInvalidCode(true);
      }
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [propCode]);

  useEffect(() => {
    if (!resolvedCode) return;
    let alive = true;
    let isHostTab = false;
    try {
      isHostTab = window.sessionStorage?.getItem(`jgb:host:${resolvedCode}`) === '1';
    } catch {
      isHostTab = false;
    }
    if (isHostTab) {
      const store = new BrowserRoomStore();
      void store.open().then(async () => {
        if (!alive) return;
        const saved = store.allRooms().find((r) => r.code === resolvedCode);
        if (saved) {
          const ok = await resumeHost(resolvedCode, gameId);
          if (ok || !alive) return;
        }
        connectClient(resolvedCode, gameId);
      });
    } else {
      connectClient(resolvedCode, gameId);
    }
    return () => {
      alive = false;
      disconnect();
    };
  }, [resolvedCode, gameId, resumeHost, connectClient, disconnect]);

  const presence = useMemo(
    () => new Map(room?.members.map((m) => [m.id, m.connected]) ?? []),
    [room?.members],
  );

  const homeHref = `/${gameId}/`;

  if (invalidCode) {
    return (
      <Centered>
        <p role="alert" className="font-display text-2xl">
          {online.home.badCode}
        </p>
        <Link href={homeHref} className="text-brass underline-offset-4 hover:underline">
          {online.ended.home}
        </Link>
      </Centered>
    );
  }

  if (status === 'ended') {
    return (
      <Centered>
        <p role="alert" className="font-display text-2xl">
          {online.ended[endReason ?? 'expired']}
        </p>
        <Link href={homeHref} className="text-brass underline-offset-4 hover:underline">
          {online.ended.home}
        </Link>
      </Centered>
    );
  }

  if (status === 'needs-join' || status === 'rejected' || (!room && joining)) {
    if (!resolvedCode) return null;
    return <JoinForm code={resolvedCode} gameId={gameId} />;
  }

  if (status === 'failed-room') {
    return (
      <Centered>
        <p role="alert" className="font-display text-2xl text-brass">
          Room not found or host is offline
        </p>
        <p className="max-w-md text-sm text-parchment/75">
          Check the room code and make sure the host still has their browser tab open.
        </p>
        <Link href={homeHref} className="text-brass underline-offset-4 hover:underline">
          {online.ended.home}
        </Link>
      </Centered>
    );
  }

  if (status === 'failed-nat') {
    return (
      <Centered>
        <p role="alert" className="font-display text-2xl text-brass">
          Direct P2P connection blocked
        </p>
        <p className="max-w-md text-sm text-parchment/75">
          A strict NAT or firewall blocked the WebRTC connection. Try switching networks, disabling
          your VPN, or asking the host to share from another network.
        </p>
        <Link href={homeHref} className="text-brass underline-offset-4 hover:underline">
          {online.ended.home}
        </Link>
      </Centered>
    );
  }

  if (!room) {
    const label =
      status === 'searching'
        ? 'Looking for room host…'
        : status === 'host-paused'
          ? 'Host disconnected — waiting for them to return…'
          : online.connection.connecting;
    return (
      <Centered>
        <p role="status">{label}</p>
        <Link
          href={homeHref}
          className="text-sm text-parchment/70 underline-offset-4 hover:underline"
        >
          {online.join.back}
        </Link>
      </Centered>
    );
  }

  const chip =
    status === 'host-paused' ? (
      <span role="status" className="rounded-full bg-gem-ruby/80 px-2.5 py-0.5 text-xs text-white">
        Host paused — reconnecting…
      </span>
    ) : isHosting ? (
      <span className="rounded-full border border-brass/40 px-2.5 py-0.5 text-xs text-brass">
        Hosting in this tab
      </span>
    ) : icePath !== 'unknown' ? (
      <span className="rounded-full border border-parchment/20 px-2.5 py-0.5 text-xs text-parchment/75">
        {icePath === 'relay' ? 'Via relay' : 'Direct P2P'}
      </span>
    ) : null;

  if (room.status === 'lobby' || !view) {
    return <Lobby room={room} chat={chat} gameId={gameId} onLeft={() => router.push(homeHref)} />;
  }

  const isHost = room.me.isHost;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Table = gameTables[gameId] ?? (GameTable as ComponentType<OnlineTableProps<any, any>>);
  return (
    <main>
      <Table
        view={view}
        onIntent={intent}
        presence={presence}
        turnDeadline={room.turnDeadline}
        clockOffset={clockOffset}
        statusChip={chip}
        side={<ChatPanel messages={chat} />}
        onPlayAgain={isHost ? () => void send('host:playAgain', {}) : undefined}
        endNote={isHost ? undefined : online.table.waitingForHost}
        onExit={() => router.push(homeHref)}
        exitCopy={{
          title: online.table.exitTitle,
          body: online.table.exitBody,
          confirm: online.table.exitConfirm,
        }}
      />
    </main>
  );
}
