import type { CSSProperties } from 'react';
import type { Level, TokenColor } from '@/games/splendor/engine';
import { hashString } from './palette';

/**
 * Illustrated art from the `assets/` folder, served by the game server at
 * /art/<sheet>.jpg. Each sheet is a horizontal strip of equal tiles:
 *
 *   cards.jpg   15 tiles: 3 per gem (levels I, II, III), gems in SHEET_GEMS order
 *   chips.jpg    6 tiles: SHEET_GEMS order, then gold
 *   deck.jpg     3 tiles: card backs for levels I, II, III
 *   nobles.jpg  10 tiles: one portrait per noble (N01..N10)
 */
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const SHEETS = {
  cards: { url: `${base}/art/cards.jpg`, count: 15 },
  chips: { url: `${base}/art/chips.jpg`, count: 6 },
  deck: { url: `${base}/art/deck.jpg`, count: 3 },
  nobles: { url: `${base}/art/nobles.jpg`, count: 10 },
} as const;
export type Sheet = keyof typeof SHEETS;

/** Gem order used by the cards and chips strips. */
export const SHEET_GEMS = ['onyx', 'sapphire', 'diamond', 'emerald', 'ruby'] as const;

/**
 * Background styles showing one tile of a strip, scaled to cover the element.
 * A small overscan crops the tile edges so neighbouring tiles never bleed in.
 */
export function spriteStyle(sheet: Sheet, index: number, overscan = 0.03): CSSProperties {
  const { url, count } = SHEETS[sheet];
  const i = Math.max(0, Math.min(count - 1, index));
  const k = 1 + overscan;
  const x = ((i * k + overscan / 2) / (count * k - 1)) * 100;
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${count * 100 * k}% auto`,
    backgroundPosition: `${x}% 50%`,
    backgroundRepeat: 'no-repeat',
  };
}

export function cardTile(bonus: TokenColor, level: Level): number {
  const gem = SHEET_GEMS.indexOf(bonus as (typeof SHEET_GEMS)[number]);
  return Math.max(0, gem) * 3 + (level - 1);
}

export function chipTile(color: TokenColor): number {
  return color === 'gold' ? 5 : SHEET_GEMS.indexOf(color);
}

/** Noble ids look like N01; unknown ids (other packs) get a stable portrait. */
export function nobleTile(id: string): number {
  const match = /^N(\d+)$/.exec(id);
  const n = match ? Number(match[1]) - 1 : hashString(id);
  return n % SHEETS.nobles.count;
}
