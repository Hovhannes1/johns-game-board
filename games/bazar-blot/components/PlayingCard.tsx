'use client';

import { rankOf, suitOf } from '@/games/bazar-blot/engine/cards';
import type { CardId } from '@/games/bazar-blot/engine/cards';
import { strings } from '@/games/bazar-blot/lib/strings';

export function PlayingCard({
  card,
  faceDown = false,
  isTrump = false,
  playable = false,
  disabled = false,
  onClick,
  size = 'md',
}: {
  card?: CardId;
  faceDown?: boolean;
  isTrump?: boolean;
  playable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}) {
  const dims = size === 'sm' ? 'h-16 w-11 text-xs' : 'h-24 w-16 sm:h-28 sm:w-20 text-sm';

  if (faceDown || !card) {
    return (
      <div
        aria-hidden="true"
        className={`${dims} flex items-center justify-center rounded-xl border border-brass/40 bg-felt-950 shadow-md`}
      >
        <div className="h-[80%] w-[78%] rounded-lg border border-brass/25 bg-[repeating-linear-gradient(45deg,rgba(201,168,76,0.08)_0_4px,transparent_4px_8px)]" />
      </div>
    );
  }

  const rank = rankOf(card);
  const suit = suitOf(card);
  const symbol = strings.suitSymbols[suit];
  const isRed = suit === 'H' || suit === 'D';
  const colorClass = isRed ? 'text-[#b91c1c]' : 'text-[#18181b]';
  const label = `Play ${rank} of ${strings.suits[suit]}`;

  const baseClass = `${dims} relative flex flex-col justify-between rounded-xl border bg-[#faf6ee] p-1.5 font-semibold shadow-md select-none transition-transform ${colorClass} ${
    isTrump ? 'ring-2 ring-brass/80 border-brass' : 'border-parchment/40'
  }`;

  const content = (
    <>
      <span className="leading-none text-left">
        {rank}
        <span className="ml-0.5">{symbol}</span>
      </span>
      <span className="self-center text-2xl sm:text-3xl leading-none">{symbol}</span>
      <span className="leading-none text-right rotate-180">
        {rank}
        <span className="ml-0.5">{symbol}</span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={`${baseClass} ${
          playable && !disabled
            ? 'cursor-pointer hover:-translate-y-2 focus-visible:outline-2 focus-visible:outline-brass'
            : 'cursor-not-allowed opacity-45'
        }`}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClass}>{content}</div>;
}
