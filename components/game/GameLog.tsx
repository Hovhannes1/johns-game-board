'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { GameView } from '@/engine';
import { catalogFor } from '@/lib/catalog';
import { formatLog } from '@/lib/format';
import { strings } from '@/lib/strings';

/** Scrolling, human-readable move history (FR-9). */
export function GameLog({ view }: { view: GameView }) {
  const listRef = useRef<HTMLOListElement>(null);
  const lines = useMemo(() => {
    const names = new Map(view.players.map((p) => [p.id, p.name]));
    return formatLog(view.log, {
      catalog: catalogFor(view.pack.id),
      playerName: (id) => names.get(id) ?? id,
    });
  }, [view.log, view.players, view.pack.id]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lines.length]);

  return (
    <section aria-label={strings.table.log} className="flex min-h-0 flex-col">
      <h2 className="mb-2 text-xs font-semibold tracking-[0.2em] text-parchment/60 uppercase">
        {strings.table.log}
      </h2>
      <ol
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-[22rem] overflow-y-auto rounded-lg border border-parchment/10 bg-felt-900/70 p-3 text-sm leading-relaxed lg:max-h-[calc(100dvh-15rem)]"
      >
        {lines.length === 0 && <li className="text-parchment/50">{strings.log.empty}</li>}
        {lines.map((line) => (
          <li key={line.key} className="border-b border-parchment/5 py-1 last:border-0">
            {line.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
