'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrowserRoomStore } from '@/platform/room/browser-store';
import type { RoomData } from '@/platform/room/host-room';
import type { RoomRecord } from '@/platform/room/store';

/** Shows any hosted rooms saved in IndexedDB so the host can resume with one click. */
export function ResumeCard() {
  const [rooms, setRooms] = useState<RoomRecord[]>([]);

  useEffect(() => {
    const store = new BrowserRoomStore();
    void store.open().then(() => {
      setRooms(store.allRooms().sort((a, b) => b.updatedAt - a.updatedAt));
    });
  }, []);

  if (rooms.length === 0) return null;

  return (
    <section className="flex w-full flex-col gap-3 rounded-2xl border border-brass/35 bg-felt-900/75 p-5 text-left">
      <h2 className="font-display text-xl font-semibold text-brass">Resume hosted rooms</h2>
      <ul className="flex flex-col gap-2">
        {rooms.map((r) => {
          const gameId = (r.data as RoomData | undefined)?.gameId ?? 'splendor';
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-parchment/15 bg-felt-950/60 px-3 py-2 text-sm"
            >
              <span className="font-semibold">{r.name}</span>
              <span className="rounded bg-parchment/10 px-2 py-0.5 text-xs uppercase tracking-wider text-parchment/75">
                {gameId}
              </span>
              <span className="font-mono text-xs text-parchment/60">{r.code}</span>
              <Link
                href={`/${gameId}/play/#${r.code}`}
                className="ml-auto rounded-lg bg-brass px-3 py-1 font-semibold text-felt-950 hover:bg-[#d9b45c]"
              >
                Resume
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
