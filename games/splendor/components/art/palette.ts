import type { Level, TokenColor } from '@/games/splendor/engine';

/** Jewel-tone palette per gem: highlight, body, shadow, outline, and card tint. */
export interface GemPalette {
  light: string;
  base: string;
  dark: string;
  stroke: string;
  /** Text color with enough contrast on `base`. */
  ink: string;
  /** Card background gradient stops. */
  cardFrom: string;
  cardTo: string;
}

export const GEM_PALETTE: Record<TokenColor, GemPalette> = {
  diamond: {
    light: '#ffffff',
    base: '#e3e9f3',
    dark: '#93a3bd',
    stroke: '#6f7d96',
    ink: '#1b2330',
    cardFrom: '#f4f1ea',
    cardTo: '#c9cfda',
  },
  sapphire: {
    light: '#a5c1ff',
    base: '#2f5fd0',
    dark: '#132d78',
    stroke: '#0e2462',
    ink: '#ffffff',
    cardFrom: '#3d64b8',
    cardTo: '#142a63',
  },
  emerald: {
    light: '#8ff0bf',
    base: '#1f9d63',
    dark: '#0b5232',
    stroke: '#08452a',
    ink: '#ffffff',
    cardFrom: '#2e8a5f',
    cardTo: '#0f3f2a',
  },
  ruby: {
    light: '#ff9aa5',
    base: '#c8283c',
    dark: '#6e0d1b',
    stroke: '#5c0a16',
    ink: '#ffffff',
    cardFrom: '#b8384a',
    cardTo: '#5a1220',
  },
  onyx: {
    light: '#9a9aa8',
    base: '#3a3a44',
    dark: '#0f0f13',
    stroke: '#b4b4c0',
    ink: '#ffffff',
    cardFrom: '#4a4652',
    cardTo: '#18171c',
  },
  gold: {
    light: '#fff3b0',
    base: '#e3b22c',
    dark: '#8f640a',
    stroke: '#6e4c05',
    ink: '#2a1d00',
    cardFrom: '#e9c45a',
    cardTo: '#9a6d10',
  },
};

/** Card back colors per level (original design, not the printed game's). */
export const LEVEL_BACKS: Record<Level, { from: string; to: string; trim: string }> = {
  1: { from: '#2f7d5d', to: '#123b2b', trim: '#9fd9b9' },
  2: { from: '#c08a26', to: '#5e3d08', trim: '#f4d58d' },
  3: { from: '#3552a8', to: '#141f4d', trim: '#a9bcf2' },
};

/** Seat accent colors for player names and markers (ids match lib/protocol SEAT_COLOR_IDS). */
export const SEAT_COLOR_HEX = {
  brass: '#c9a24a',
  teal: '#4fb3a9',
  rose: '#d0607a',
  violet: '#8f7ad6',
  sky: '#5aa9e6',
  lime: '#9bc53d',
} as const;

/** Default colors by seat index (hot-seat play). */
export const SEAT_COLORS = [
  SEAT_COLOR_HEX.brass,
  SEAT_COLOR_HEX.teal,
  SEAT_COLOR_HEX.rose,
  SEAT_COLOR_HEX.violet,
] as const;

/** Stable small hash for deterministic per-card art variation. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** SVG ids must be valid in url(#...) references. */
export function svgId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}
