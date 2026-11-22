'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { HistoryEntry } from '@/lib/protocol';
import { joinList, online } from '@/lib/strings';

const t = online.history;

/** Finished games stored on this server (FR-26). */
export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    void api<{ history: HistoryEntry[] }>('GET', '/api/history').then((res) => {
      if (!alive) return;
      if (res.ok) setEntries(res.data.history);
      else setDenied(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center gap-4">
        <h1 className="font-display text-4xl font-semibold text-brass">{t.title}</h1>
        <Link
          href="/"
          className="ml-auto text-sm text-parchment/70 underline-offset-4 hover:underline"
        >
          {online.join.back}
        </Link>
      </header>
      {denied && <p>{t.needSession}</p>}
      {entries?.length === 0 && <p className="text-parchment/70">{t.empty}</p>}
      {entries && entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-parchment/60">
              <tr>
                <th scope="col" className="py-2 pr-4">
                  {t.date}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t.room}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t.rounds}
                </th>
                <th scope="col" className="py-2">
                  {t.results}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-parchment/10 align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {new Date(e.finishedAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">{e.roomName}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {e.rounds}
                    {e.reason === 'stalemate' && ` (${t.stalemate})`}
                  </td>
                  <td className="py-2">
                    {joinList(
                      [...e.players]
                        .sort((a, b) => a.rank - b.rank)
                        .map((p) => `${p.winner ? '★ ' : ''}${p.name} ${p.points}`),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
