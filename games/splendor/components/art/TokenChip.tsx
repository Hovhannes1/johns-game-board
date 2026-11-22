'use client';

import type { CSSProperties } from 'react';
import type { TokenColor } from '@/games/splendor/engine';
import { useArtStyle } from '@/games/splendor/stores/preferences';
import { GemIcon } from './GemIcon';
import { GEM_PALETTE } from './palette';
import { chipTile, spriteStyle } from './sprites';

/** Fixed sizes, plus `fluid` which follows the parent's font-size (tableau columns). */
const SIZES = {
  xs: '1.6rem',
  sm: '2.1rem',
  md: '3rem',
  lg: '3.75rem',
  /** The bank under the cards: as large as fits six in a row. */
  bank: 'clamp(2.6rem, 11vw, 3.75rem)',
  fluid: '4.6em',
} as const;

interface TokenChipProps {
  color: TokenColor;
  size?: keyof typeof SIZES;
  /** Badge number (e.g. pile size); hidden when undefined. */
  count?: number;
  dimmed?: boolean;
  raised?: boolean;
}

/**
 * Gem token. Vector style: poker chip with edge spots and a faceted emblem.
 * Image style: the illustrated chip, with the vector chip underneath as a
 * fallback if the image is missing. Decorative only.
 */
export function TokenChip({ color, size = 'md', count, dimmed, raised }: TokenChipProps) {
  const art = useArtStyle();
  const p = GEM_PALETTE[color];
  const isGold = color === 'gold';
  const edge = isGold ? 'rgba(255,248,214,0.9)' : 'rgba(255,255,255,0.82)';
  const style: CSSProperties = {
    width: SIZES[size],
    height: SIZES[size],
    background: `repeating-conic-gradient(from 8deg, ${edge} 0deg 13deg, transparent 13deg 45deg),
      radial-gradient(circle at 35% 28%, ${p.light}, ${p.base} 55%, ${p.dark})`,
    boxShadow: raised
      ? '0 0.5rem 0.9rem rgb(0 0 0 / 0.55), 0 0 0 2px var(--color-brass)'
      : '0 0.2rem 0.35rem rgb(0 0 0 / 0.5), inset 0 -0.15rem 0.2rem rgb(0 0 0 / 0.35)',
    transform: raised ? 'translateY(-0.2rem) rotateX(12deg)' : 'rotateX(12deg)',
  };
  const badge =
    size === 'fluid'
      ? 'min-w-[max(1.15rem,2.6em)] text-[max(10px,1.55em)] leading-[1.6]'
      : 'min-w-[1.35rem] text-xs leading-5';
  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid shrink-0 place-items-center rounded-full transition-[transform,box-shadow,opacity] duration-200 ${dimmed ? 'opacity-35 grayscale-[0.4]' : ''}`}
      style={style}
    >
      <span
        className="grid size-[68%] place-items-center rounded-full"
        style={{
          background: `radial-gradient(circle at 40% 30%, ${p.light}, ${p.base} 60%, ${p.dark})`,
          boxShadow: `inset 0 0 0 1.5px ${isGold ? '#fff3b0' : 'rgb(255 255 255 / 0.35)'}, inset 0 0.15rem 0.3rem rgb(0 0 0 / 0.35)`,
        }}
      >
        <GemIcon color={color} size="72%" />
      </span>
      {art === 'images' && (
        <span
          className="absolute inset-0 rounded-full"
          style={spriteStyle('chips', chipTile(color), 0.04)}
        />
      )}
      {count !== undefined && (
        <span
          className={`absolute -top-1 -right-1.5 rounded-full border border-brass/70 bg-felt-950 px-1 text-center font-semibold text-parchment tabular-nums ${badge}`}
        >
          {count}
        </span>
      )}
    </span>
  );
}
