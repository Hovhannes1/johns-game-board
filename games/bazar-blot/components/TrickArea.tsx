'use client';

import { useState } from 'react';
import type { GameView } from '@/games/bazar-blot/engine';
import { strings } from '@/games/bazar-blot/lib/strings';
import { PlayingCard } from './PlayingCard';

export function TrickArea({
  view,
  seatPositions,
}: {
  view: GameView;
  /** [bottom, left, top, right] seat indices relative to viewer. */
  seatPositions: readonly [number, number, number, number];
}) {
  const [showLast, setShowLast] = useState(false);
  const plays = showLast && view.lastTrick ? view.lastTrick.plays : view.trick.plays;
  const playBySeat = new Map(plays.map((p) => [p.seat, p.card]));
  const strain = view.contract?.strain;

  const renderSlot = (seat: number) => {
    const card = playBySeat.get(seat);
    const p = view.players[seat];
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-[0.7rem] text-parchment/60">{p?.name}</span>
        {card ? (
          <PlayingCard
            card={card}
            size="sm"
            isTrump={strain !== undefined && strain !== 'BOY' && card.endsWith(strain)}
          />
        ) : (
          <div className="h-16 w-11 rounded-xl border border-dashed border-parchment/20" />
        )}
      </div>
    );
  };

  const [bottom, left, top, right] = seatPositions;

  return (
    <section
      aria-label="Current trick"
      className="flex flex-col items-center gap-3 rounded-2xl border border-brass/25 bg-felt-900/60 p-4"
    >
      <div className="grid grid-cols-3 items-center gap-3">
        <div />
        {renderSlot(top)}
        <div />
        {renderSlot(left)}
        <div className="flex flex-col items-center justify-center text-center text-xs text-parchment/70">
          {showLast && view.lastTrick ? (
            <span>Won by {view.players[view.lastTrick.winner]?.name}</span>
          ) : (
            <span>Trick {view.tricksWon[0] + view.tricksWon[1] + 1}/8</span>
          )}
        </div>
        {renderSlot(right)}
        <div />
        {renderSlot(bottom)}
        <div />
      </div>

      {view.lastTrick && (
        <button
          type="button"
          onClick={() => setShowLast((v) => !v)}
          className="text-xs text-brass underline-offset-4 hover:underline"
        >
          {showLast ? strings.table.hideLastTrick : strings.table.lastTrick}
        </button>
      )}
    </section>
  );
}
