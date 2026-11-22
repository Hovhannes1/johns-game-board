'use client';

import { useId } from 'react';
import type { CSSProperties } from 'react';
import { GEM_COLORS } from '@/games/splendor/engine';
import type { CardDef, Level } from '@/games/splendor/engine';
import { strings } from '@/games/splendor/lib/strings';
import { useArtStyle } from '@/games/splendor/stores/preferences';
import { gemOutline, GemIcon } from './GemIcon';
import { GEM_PALETTE, hashString, LEVEL_BACKS, svgId } from './palette';
import { cardTile, spriteStyle } from './sprites';

/** Card scale: everything inside a card is sized in em, so one font-size scales it all. */
export const CARD_SCALES = {
  xs: '6px',
  sm: '8px',
  /** Responsive sizes: see the --*-scale variables in app/globals.css. */
  md: 'var(--card-scale)',
  mine: 'var(--mine-scale)',
  theirs: 'var(--their-scale)',
  noble: 'calc(var(--card-scale) * 0.8)',
  lg: '20px',
} as const;
export type CardScale = keyof typeof CARD_SCALES;

const cardBox = (scale: CardScale): CSSProperties => ({
  fontSize: CARD_SCALES[scale],
  width: '7em',
  height: '9.8em',
});

/** Four reusable Renaissance motifs; each card picks one plus a placement from its id. */
function Motif({ card, id }: { card: CardDef; id: string }) {
  const h = hashString(card.id);
  const p = GEM_PALETTE[card.bonus];
  const motif = h % 4;
  const rotate = ((h >>> 3) % 7) * 9 - 27;
  const dx = 18 + ((h >>> 6) % 20);
  const dy = 38 + ((h >>> 11) % 26);
  const line = card.bonus === 'diamond' ? 'rgba(60,70,90,0.18)' : 'rgba(255,255,255,0.13)';

  const pattern = (() => {
    switch (motif) {
      case 0:
        return (
          <pattern
            id={`${id}p`}
            width="9"
            height="9"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <path d="M0 0V9M0 0H9" stroke={line} strokeWidth="0.8" />
          </pattern>
        );
      case 1:
        return (
          <pattern id={`${id}p`} width="12" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 14V7A6 6 0 0 1 12 7V14" fill="none" stroke={line} strokeWidth="0.8" />
          </pattern>
        );
      case 2:
        return (
          <pattern id={`${id}p`} width="12" height="10.4" patternUnits="userSpaceOnUse">
            <circle cx="6" cy="5.2" r="6" fill="none" stroke={line} strokeWidth="0.6" />
            <circle cx="0" cy="0" r="6" fill="none" stroke={line} strokeWidth="0.6" />
            <circle cx="12" cy="10.4" r="6" fill="none" stroke={line} strokeWidth="0.6" />
          </pattern>
        );
      default:
        return (
          <pattern id={`${id}p`} width="10" height="6" patternUnits="userSpaceOnUse">
            <path
              d="M0 6A5 5 0 0 1 10 6M-5 3A5 5 0 0 1 5 3M5 3A5 5 0 0 1 15 3"
              fill="none"
              stroke={line}
              strokeWidth="0.7"
            />
          </pattern>
        );
    }
  })();

  return (
    <svg
      viewBox="0 0 70 98"
      className="absolute inset-0 size-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={p.cardFrom} />
          <stop offset="1" stopColor={p.cardTo} />
        </linearGradient>
        <radialGradient id={`${id}shine`} cx="0.3" cy="0.15" r="0.9">
          <stop offset="0" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="0.5" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        {pattern}
      </defs>
      <rect width="70" height="98" fill={`url(#${id}bg)`} />
      <rect width="70" height="98" fill={`url(#${id}p)`} />
      <g
        transform={`translate(${dx} ${dy}) rotate(${rotate}) scale(2.3) translate(-12 -12)`}
        opacity="0.22"
      >
        <path d={gemOutline(card.bonus)} fill={p.light} stroke={p.dark} strokeWidth="0.6" />
      </g>
      <rect width="70" height="98" fill={`url(#${id}shine)`} />
      <rect
        x="1.5"
        y="1.5"
        width="67"
        height="95"
        rx="4"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="0.8"
      />
    </svg>
  );
}

interface CardFaceProps {
  card: CardDef;
  scale?: CardScale;
  highlight?: boolean;
}

/** Illustrated layer over the vector art; if the image is missing the vector shows through. */
function ImageLayer({ style }: { style: CSSProperties }) {
  return <span aria-hidden="true" className="absolute inset-0" style={style} />;
}

/** Portrait development card: points top left, bonus top right, cost bottom left (4.1). */
export function CardFace({ card, scale = 'md', highlight }: CardFaceProps) {
  const id = svgId(`c${useId()}`);
  const images = useArtStyle() === 'images';
  // Illustrated cards get a pale band like the printed game; vector diamond cards are light too.
  const lightBand = images || card.bonus === 'diamond';
  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 overflow-hidden rounded-[0.55em] shadow-[0_0.25em_0.6em_rgb(0_0_0/0.55)] ${highlight ? 'ring-[0.18em] ring-brass' : ''}`}
      style={cardBox(scale)}
    >
      <Motif card={card} id={id} />
      {images && <ImageLayer style={spriteStyle('cards', cardTile(card.bonus, card.level))} />}
      <span
        className={`absolute inset-x-0 top-0 flex h-[2.25em] items-center justify-between px-[0.45em] ${images ? 'bg-white/72' : lightBand ? 'bg-[#1b2330]/10' : 'bg-white/20'}`}
      >
        <span
          className="font-display text-[1.85em] leading-none font-bold"
          style={
            lightBand
              ? { color: '#1b2330', textShadow: '0 0.04em 0 rgb(255 255 255 / 0.7)' }
              : { color: '#fff', textShadow: '0 0.06em 0.12em rgb(0 0 0 / 0.85), 0 0 0.04em #000' }
          }
        >
          {card.points > 0 ? card.points : ''}
        </span>
        <GemIcon color={card.bonus} size="1.75em" />
      </span>
      <span className="absolute bottom-[0.4em] left-[0.35em] flex flex-col-reverse gap-[0.18em]">
        {GEM_COLORS.filter((c) => card.cost[c] > 0).map((c) => (
          <span
            key={c}
            className="flex items-center gap-[0.12em] rounded-full bg-black/55 py-[0.08em] pr-[0.4em] pl-[0.12em] ring-1 ring-white/25"
          >
            <GemIcon color={c} size="1.2em" />
            <span className="text-[1em] leading-none font-bold text-white tabular-nums">
              {card.cost[c]}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

interface CardBackProps {
  level: Level;
  scale?: CardScale;
  count?: number;
}

/** Level-coded card back: vector lattice and numeral medallion, or the illustrated back. */
export function CardBack({ level, scale = 'md', count }: CardBackProps) {
  const id = svgId(`b${useId()}`);
  const back = LEVEL_BACKS[level];
  const images = useArtStyle() === 'images';
  return (
    <span
      aria-hidden="true"
      className="relative block shrink-0 overflow-hidden rounded-[0.55em] shadow-[0_0.25em_0.6em_rgb(0_0_0/0.55)]"
      style={cardBox(scale)}
    >
      <svg viewBox="0 0 70 98" className="absolute inset-0 size-full" focusable="false">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="0.5" y2="1">
            <stop offset="0" stopColor={back.from} />
            <stop offset="1" stopColor={back.to} />
          </linearGradient>
          <pattern
            id={`${id}p`}
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect
              width="10"
              height="10"
              fill="none"
              stroke={back.trim}
              strokeOpacity="0.25"
              strokeWidth="0.8"
            />
          </pattern>
        </defs>
        <rect width="70" height="98" fill={`url(#${id}g)`} />
        <rect width="70" height="98" fill={`url(#${id}p)`} />
        <rect
          x="3"
          y="3"
          width="64"
          height="92"
          rx="4"
          fill="none"
          stroke={back.trim}
          strokeOpacity="0.7"
          strokeWidth="1"
        />
        <circle cx="35" cy="45" r="15" fill={back.to} stroke={back.trim} strokeWidth="1.2" />
        <text
          x="35"
          y="51"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontSize="17"
          fontWeight="700"
          fill={back.trim}
        >
          {strings.levelNumerals[level]}
        </text>
      </svg>
      {images && <ImageLayer style={spriteStyle('deck', level - 1)} />}
      {count !== undefined &&
        (images ? (
          // The illustrated backs show level dots at the bottom, so the count goes on top.
          <span className="absolute top-[0.45em] left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-[0.55em] text-[1.15em] leading-[1.5] font-semibold text-white tabular-nums">
            {count}
          </span>
        ) : (
          <span className="absolute inset-x-0 bottom-[0.5em] text-center text-[1.15em] font-semibold text-white tabular-nums">
            {count}
          </span>
        ))}
    </span>
  );
}

/** Placeholder for an empty market slot. */
export function EmptySlot({ scale = 'md' }: { scale?: CardScale }) {
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 rounded-[0.55em] border border-dashed border-parchment/20"
      style={cardBox(scale)}
    />
  );
}
