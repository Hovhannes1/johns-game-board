'use client';

import type { GameView } from '@/games/bazar-blot/engine';
import { teamOf } from '@/games/bazar-blot/engine';
import { strings } from '@/games/bazar-blot/lib/strings';

export function ScoreBoard({ view }: { view: GameView }) {
  const myTeam = view.viewerSeat !== null ? teamOf(view.viewerSeat) : 0;
  const oppTeam = 1 - myTeam;
  const myLabel = view.viewerSeat !== null ? strings.table.us : strings.table.teamLabel(0);
  const oppLabel = view.viewerSeat !== null ? strings.table.them : strings.table.teamLabel(1);
  const c = view.contract;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="grid grid-cols-2 divide-x divide-parchment/15 overflow-hidden rounded-xl border border-brass/35 bg-felt-950/90 text-center shadow-lg backdrop-blur-xs">
        <div className="px-2.5 py-1 sm:px-3">
          <div className="text-[0.65rem] font-semibold tracking-wider text-gem-emerald uppercase">
            {myLabel}
          </div>
          <div className="font-display text-base leading-tight font-bold text-parchment tabular-nums sm:text-lg">
            {view.scores[myTeam]}
            <span className="text-[0.65rem] font-normal text-parchment/55">
              /{view.targetScore}
            </span>
          </div>
        </div>
        <div className="px-2.5 py-1 sm:px-3">
          <div className="text-[0.65rem] font-semibold tracking-wider text-[#f0a0a8] uppercase">
            {oppLabel}
          </div>
          <div className="font-display text-base leading-tight font-bold text-parchment tabular-nums sm:text-lg">
            {view.scores[oppTeam]}
            <span className="text-[0.65rem] font-normal text-parchment/55">
              /{view.targetScore}
            </span>
          </div>
        </div>
      </div>

      {c && (
        <div className="flex items-center gap-1.5 rounded-full border border-brass/30 bg-felt-950/85 px-2.5 py-0.5 text-[0.7rem] font-semibold text-brass shadow">
          <span>
            {c.kaput ? `${strings.bidding.kaput} ` : ''}
            {c.value} {c.strain === 'BOY' ? 'Boy' : strings.suitSymbols[c.strain]}
            {c.kontra === 1 ? ' ×K' : c.kontra === 2 ? ' ×RK' : ''}
          </span>
          <span className="text-parchment/40">·</span>
          <span className="text-parchment/80 tabular-nums">
            {view.tricksWon[myTeam]}–{view.tricksWon[oppTeam]}
          </span>
        </div>
      )}
    </div>
  );
}
