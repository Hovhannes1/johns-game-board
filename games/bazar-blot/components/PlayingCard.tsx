'use client';

import { rankOf, suitOf } from '@/games/bazar-blot/engine/cards';
import type { CardId, Rank } from '@/games/bazar-blot/engine/cards';
import { strings } from '@/games/bazar-blot/lib/strings';

// Normalized [x%, y%, inverted?] pip coordinates inside the card's center pip box.
const PIP_LAYOUTS: Partial<Record<Rank, readonly [number, number, boolean?][]>> = {
  '7': [
    [25, 16],
    [75, 16],
    [50, 33],
    [25, 50],
    [75, 50],
    [25, 84, true],
    [75, 84, true],
  ],
  '8': [
    [25, 16],
    [75, 16],
    [50, 33],
    [25, 50],
    [75, 50],
    [50, 67, true],
    [25, 84, true],
    [75, 84, true],
  ],
  '9': [
    [25, 14],
    [75, 14],
    [25, 38],
    [75, 38],
    [50, 50],
    [25, 62, true],
    [75, 62, true],
    [25, 86, true],
    [75, 86, true],
  ],
  '10': [
    [25, 14],
    [75, 14],
    [50, 26],
    [25, 38],
    [75, 38],
    [25, 62, true],
    [75, 62, true],
    [50, 74, true],
    [25, 86, true],
    [75, 86, true],
  ],
};

function CourtIllustration({ rank, symbol }: { rank: 'J' | 'Q' | 'K'; symbol: string }) {
  return (
    <div className="relative mx-1 my-0.5 flex flex-1 flex-col items-center justify-center rounded border border-brass/50 bg-brass/10">
      {rank === 'J' && (
        <svg
          viewBox="0 0 32 32"
          className="size-6 sm:size-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M16 4l8 4v7c0 6-3.5 10.5-8 13-4.5-2.5-8-7-8-13V8l8-4z"
            fill="currentColor"
            fillOpacity="0.12"
          />
          <path d="M16 9v14M12 13h8" />
        </svg>
      )}
      {rank === 'Q' && (
        <svg
          viewBox="0 0 32 32"
          className="size-6 sm:size-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M6 22l2-10 5 4 3-7 3 7 5-4 2 10H6z" fill="currentColor" fillOpacity="0.14" />
          <circle cx="16" cy="7" r="1.5" fill="currentColor" />
          <path d="M7 25h18" />
        </svg>
      )}
      {rank === 'K' && (
        <svg
          viewBox="0 0 32 32"
          className="size-6 sm:size-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M5 22l2-11 4.5 5L16 7l4.5 9L25 11l2 11H5z"
            fill="currentColor"
            fillOpacity="0.16"
          />
          <path d="M16 3v4M14 5h4M6 25h20" />
        </svg>
      )}
      <span className="absolute right-0.5 bottom-0 text-[0.55rem] leading-none opacity-75">
        {symbol}
      </span>
    </div>
  );
}

function CardCenter({
  rank,
  symbol,
  size,
}: {
  rank: Rank;
  symbol: string;
  size: 'xs' | 'sm' | 'md';
}) {
  if (size === 'xs') {
    return <span className="self-center text-xs leading-none">{symbol}</span>;
  }

  if (rank === 'J' || rank === 'Q' || rank === 'K') {
    return <CourtIllustration rank={rank} symbol={symbol} />;
  }

  const pips = PIP_LAYOUTS[rank];
  if (!pips) {
    return (
      <span
        className={`self-center leading-none ${size === 'sm' ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'}`}
      >
        {symbol}
      </span>
    );
  }

  const pipSize = size === 'sm' ? 'text-[0.65rem] sm:text-xs' : 'text-xs sm:text-sm';
  return (
    <div className="relative mx-1.5 flex-1 sm:mx-2">
      {pips.map(([x, y, inv], idx) => (
        <span
          key={idx}
          style={{ left: `${x}%`, top: `${y}%` }}
          className={`absolute -translate-x-1/2 -translate-y-1/2 leading-none ${pipSize} ${inv ? 'rotate-180' : ''
            }`}
        >
          {symbol}
        </span>
      ))}
    </div>
  );
}

export function PlayingCard({
  card,
  faceDown = false,
  isTrump = false,
  playable = false,
  disabled = false,
  onClick,
  size = 'md',
  className = '',
}: {
  card?: CardId;
  faceDown?: boolean;
  isTrump?: boolean;
  playable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const dims =
    size === 'xs'
      ? 'h-10 w-7 text-[0.6rem] rounded-md p-0.5'
      : size === 'sm'
        ? 'h-20 w-14 sm:h-24 sm:w-17 text-xs rounded-xl p-1'
        : 'h-20 w-12 sm:h-32 sm:w-22 text-[0.7rem] sm:text-sm rounded-lg sm:rounded-xl p-1 sm:p-1.5';

  if (faceDown || !card) {
    return (
      <div
        aria-hidden="true"
        className={`${dims} ${className} flex items-center justify-center border border-brass/50 bg-[#1a2b4c] shadow-md`}
      >
        <div className="h-[82%] w-[80%] rounded-sm border border-brass/30 bg-[repeating-linear-gradient(45deg,rgba(201,168,76,0.14)_0_3px,transparent_3px_6px)]" />
      </div>
    );
  }

  const rank = rankOf(card);
  const suit = suitOf(card);
  const symbol = strings.suitSymbols[suit];
  const isRed = suit === 'H' || suit === 'D';
  const colorClass = isRed ? 'text-[#b91c1c]' : 'text-[#18181b]';
  const label = `Play ${rank} of ${strings.suits[suit]}`;

  const faceBg = onClick && (!playable || disabled) ? 'bg-[#c9c3b8]' : 'bg-[#faf6ee]';
  const baseClass = `${dims} ${className} relative flex flex-col justify-between border ${faceBg} font-bold shadow-md select-none transition-transform duration-150 ${colorClass} ${isTrump ? 'ring-2 ring-brass border-brass' : 'border-black/25'
    }`;

  const content = (
    <>
      <span className="leading-none text-left">
        {rank}
        <span className="ml-0.5">{symbol}</span>
      </span>
      <CardCenter rank={rank} symbol={symbol} size={size} />
      {size !== 'xs' && (
        <span className="leading-none text-right rotate-180">
          {rank}
          <span className="ml-0.5">{symbol}</span>
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={`${baseClass} ${playable && !disabled
          ? 'cursor-pointer hover:z-20 hover:-translate-y-4 hover:shadow-xl focus-visible:z-20 focus-visible:-translate-y-4 focus-visible:outline-2 focus-visible:outline-brass'
          : 'cursor-default'
          }`}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

export function CardBackFan({
  count,
  orientation = 'horizontal',
}: {
  count: number;
  orientation?: 'horizontal' | 'vertical';
}) {
  const shown = Math.min(count, 8);
  if (shown <= 0) return null;
  const isVertical = orientation === 'vertical';
  return (
    <div aria-hidden="true" className={`flex items-center ${isVertical ? 'flex-col' : 'flex-row'}`}>
      {Array.from({ length: shown }).map((_, i) => (
        <div
          key={i}
          className={`rounded-lg border border-brass/60 bg-[#1a2b4c] shadow-md ${isVertical
            ? `h-10 w-14 sm:h-14 sm:w-20 ${i > 0 ? '-mt-6 sm:-mt-9' : ''}`
            : `h-14 w-10 sm:h-20 sm:w-14 ${i > 0 ? '-ml-5 sm:-ml-7' : ''}`
            }`}
        >
          <div className="m-1 h-[calc(100%-8px)] rounded-sm border border-brass/30 bg-[repeating-linear-gradient(45deg,rgba(201,168,76,0.18)_0_3px,transparent_3px_6px)]" />
        </div>
      ))}
    </div>
  );
}
