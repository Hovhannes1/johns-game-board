'use client';

import type { GameView } from '@/games/bazar-blot/engine';
import { PlayingCard } from './PlayingCard';

export function TrickArea({
  view,
  seatPositions,
}: {
  view: GameView;
  /** [bottom, left, top, right] seat indices relative to viewer. */
  seatPositions: readonly [number, number, number, number];
}) {
  const playBySeat = new Map(view.trick.plays.map((p) => [p.seat, p.card]));
  const strain = view.contract?.strain;

  const renderSlot = (seat: number) => {
    const card = playBySeat.get(seat);
    return card ? (
      <PlayingCard
        card={card}
        size="sm"
        isTrump={strain !== undefined && strain !== 'BOY' && card.endsWith(strain)}
      />
    ) : (
      <div className="h-20 w-14 rounded-xl border border-dashed border-parchment/15 sm:h-24 sm:w-17" />
    );
  };

  const [bottom, left, top, right] = seatPositions;

  return (
    <section aria-label="Current trick" className="grid grid-cols-3 items-center gap-1 sm:gap-2">
      <div />
      <div className="-mb-3 flex justify-center sm:-mb-2">{renderSlot(top)}</div>
      <div />
      <div className="-mr-2 flex justify-center sm:-mr-1">{renderSlot(left)}</div>
      <div className="flex flex-col items-center justify-center text-center text-[0.7rem] font-semibold tracking-wider text-parchment/45 uppercase">
        <span>{view.tricksWon[0] + view.tricksWon[1] + 1}/8</span>
      </div>
      <div className="-ml-2 flex justify-center sm:-ml-1">{renderSlot(right)}</div>
      <div />
      <div className="-mt-3 flex justify-center sm:-mt-2">{renderSlot(bottom)}</div>
      <div />
    </section>
  );
}
