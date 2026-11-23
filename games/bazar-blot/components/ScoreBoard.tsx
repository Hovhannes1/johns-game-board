'use client';

import type { GameView } from '@/games/bazar-blot/engine';
import { strings } from '@/games/bazar-blot/lib/strings';

export function ScoreBoard({ view }: { view: GameView }) {
  const team0Names = `${view.players[0]?.name} & ${view.players[2]?.name}`;
  const team1Names = `${view.players[1]?.name} & ${view.players[3]?.name}`;
  const c = view.contract;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-parchment/15 bg-felt-900/75 px-3 py-2">
        <div className="text-xs text-parchment/60">{strings.table.teamLabel(0)}</div>
        <div className="truncate text-sm font-semibold">{team0Names}</div>
        <div className="mt-0.5 font-display text-2xl text-brass tabular-nums">
          {view.scores[0]}{' '}
          <span className="text-xs font-sans text-parchment/55">/ {view.targetScore}</span>
        </div>
      </div>

      <div className="flex flex-col justify-center rounded-xl border border-brass/30 bg-felt-950/70 px-3 py-2 text-center">
        <div className="text-xs text-parchment/60">{strings.table.round(view.roundNo)}</div>
        {c ? (
          <div className="mt-0.5 text-sm font-semibold text-brass">
            {c.kaput ? `${strings.bidding.kaput} ` : ''}
            {c.value} {strings.strains[c.strain]}
            {c.kontra === 1 ? ' · Kontra' : c.kontra === 2 ? ' · Rekontra' : ''}
          </div>
        ) : (
          <div className="mt-0.5 text-sm text-parchment/75">{strings.bidding.title}</div>
        )}
        {c && (
          <div className="text-xs text-parchment/65">
            {strings.table.tricks}: {view.tricksWon[0]} – {view.tricksWon[1]}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-parchment/15 bg-felt-900/75 px-3 py-2 text-right">
        <div className="text-xs text-parchment/60">{strings.table.teamLabel(1)}</div>
        <div className="truncate text-sm font-semibold">{team1Names}</div>
        <div className="mt-0.5 font-display text-2xl text-brass tabular-nums">
          {view.scores[1]}{' '}
          <span className="text-xs font-sans text-parchment/55">/ {view.targetScore}</span>
        </div>
      </div>
    </div>
  );
}
