'use client';

import { useId } from 'react';
import { GEM_COLORS } from '@/engine';
import type { NobleDef } from '@/engine';
import { useArtStyle } from '@/stores/preferences';
import { CARD_SCALES } from './CardArt';
import type { CardScale } from './CardArt';
import { GemIcon } from './GemIcon';
import { GEM_PALETTE, hashString, svgId } from './palette';
import { nobleTile, spriteStyle } from './sprites';

/** Headwear variants for the original bust portraits. */
const HEADWEAR = [
  // crown
  'M24 13L27 18L31 12L35 18L39 12L42 18L45 13L44 22H25Z',
  // beret
  'M22 21C22 13 32 10 39 11C46 12 49 16 47 20C42 18 30 18 22 21Z',
  // veil
  'M23 26C22 14 28 10 34.5 10C41 10 47 14 46 26L49 40C44 34 43 28 43 24C40 20 29 20 26 24C26 28 25 34 20 40Z',
  // tall hat
  'M26 19L28 6H41L43 19C40 20 29 20 26 19ZM23 20H46V22H23Z',
] as const;

interface NobleTileProps {
  noble: NobleDef;
  scale?: CardScale;
  highlight?: boolean;
}

/** Square noble tile: gold frame, portrait, prestige badge, bonus requirements on the left edge. */
export function NobleTile({ noble, scale = 'md', highlight }: NobleTileProps) {
  const id = svgId(`n${useId()}`);
  const images = useArtStyle() === 'images';
  const h = hashString(noble.id);
  const needs = GEM_COLORS.filter((c) => noble.requires[c] > 0);
  const tint = GEM_PALETTE[needs[0] ?? 'diamond'];
  const robe = GEM_PALETTE[needs[1] ?? needs[0] ?? 'ruby'];
  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 overflow-hidden rounded-[0.4em] shadow-[0_0.25em_0.6em_rgb(0_0_0/0.55)] ${highlight ? 'ring-[0.18em] ring-brass' : ''}`}
      style={{ fontSize: CARD_SCALES[scale], width: '7em', height: '7em' }}
    >
      <svg viewBox="0 0 70 70" className="absolute inset-0 size-full" focusable="false">
        <defs>
          <radialGradient id={`${id}bg`} cx="0.6" cy="0.35" r="0.85">
            <stop offset="0" stopColor="#f6ecd2" />
            <stop offset="0.7" stopColor="#d9c08a" />
            <stop offset="1" stopColor={tint.dark} />
          </radialGradient>
          <linearGradient id={`${id}robe`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={robe.base} />
            <stop offset="1" stopColor={robe.dark} />
          </linearGradient>
        </defs>
        <rect width="70" height="70" fill={`url(#${id}bg)`} />
        {/* bust */}
        <path d="M14 70C15 52 24 46 34.5 46C45 46 54 52 55 70Z" fill={`url(#${id}robe)`} />
        <path
          d="M28 46L34.5 56L41 46"
          fill="none"
          stroke="#f6ecd2"
          strokeWidth="1.6"
          strokeOpacity="0.8"
        />
        <ellipse
          cx="34.5"
          cy="31"
          rx="9"
          ry="11"
          fill="#e8c9a2"
          stroke="#7a5532"
          strokeWidth="0.8"
        />
        <path d={HEADWEAR[h % HEADWEAR.length]} fill="#3b2a1a" stroke="#c9a24a" strokeWidth="0.8" />
        <rect
          x="1.5"
          y="1.5"
          width="67"
          height="67"
          rx="3"
          fill="none"
          stroke="#c9a24a"
          strokeWidth="2.5"
        />
        <rect
          x="4"
          y="4"
          width="62"
          height="62"
          rx="2"
          fill="none"
          stroke="#fff3c4"
          strokeOpacity="0.6"
          strokeWidth="0.6"
        />
      </svg>
      {images && (
        <>
          <span className="absolute inset-0" style={spriteStyle('nobles', nobleTile(noble.id))} />
          {/* Pale strip behind the requirements, and a gold frame, as on the printed tiles. */}
          <span className="absolute inset-y-0 left-0 w-[2.3em] bg-[#f3e9d2]/80" />
          <span className="absolute inset-0 rounded-[0.4em] border-[0.22em] border-[#c9a24a]" />
        </>
      )}
      <span
        className="absolute top-[0.35em] right-[0.45em] font-display text-[1.7em] leading-none font-bold text-white"
        style={{ textShadow: '0 0.06em 0.14em rgb(0 0 0 / 0.9)' }}
      >
        {noble.points}
      </span>
      <span className="absolute top-[0.45em] left-[0.4em] flex flex-col gap-[0.2em]">
        {needs.map((c) => (
          <span
            key={c}
            className="flex h-[1.75em] w-[1.5em] flex-col items-center justify-center rounded-[0.2em] ring-1 ring-black/40"
            style={{ background: GEM_PALETTE[c].base, color: GEM_PALETTE[c].ink }}
          >
            <span className="text-[1em] leading-none font-bold tabular-nums">
              {noble.requires[c]}
            </span>
            <GemIcon color={c} size="0.75em" />
          </span>
        ))}
      </span>
    </span>
  );
}
