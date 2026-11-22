/**
 * Gem and token primitives.
 *
 * Gem colors follow the order of the color cycle used throughout the card
 * design (diamond -> sapphire -> emerald -> ruby -> onyx -> diamond ...).
 */

export const GEM_COLORS = ['diamond', 'sapphire', 'emerald', 'ruby', 'onyx'] as const;
export type GemColor = (typeof GEM_COLORS)[number];

export const GOLD = 'gold' as const;
export type Gold = typeof GOLD;

export const TOKEN_COLORS = [...GEM_COLORS, GOLD] as const;
export type TokenColor = (typeof TOKEN_COLORS)[number];

export type GemCounts = Record<GemColor, number>;
export type TokenCounts = Record<TokenColor, number>;

export function isGemColor(value: unknown): value is GemColor {
  return typeof value === 'string' && (GEM_COLORS as readonly string[]).includes(value);
}

export function isTokenColor(value: unknown): value is TokenColor {
  return typeof value === 'string' && (TOKEN_COLORS as readonly string[]).includes(value);
}

export function emptyGems(): GemCounts {
  return { diamond: 0, sapphire: 0, emerald: 0, ruby: 0, onyx: 0 };
}

export function emptyTokens(): TokenCounts {
  return { ...emptyGems(), gold: 0 };
}

/** Builds a full count record from a sparse one (missing colors become 0). */
export function toGemCounts(sparse: Partial<Record<GemColor, number>>): GemCounts {
  const out = emptyGems();
  for (const color of GEM_COLORS) out[color] = sparse[color] ?? 0;
  return out;
}

export function toTokenCounts(sparse: Partial<Record<TokenColor, number>>): TokenCounts {
  const out = emptyTokens();
  for (const color of TOKEN_COLORS) out[color] = sparse[color] ?? 0;
  return out;
}

export function sumCounts(counts: Partial<Record<TokenColor, number>>): number {
  let total = 0;
  for (const color of TOKEN_COLORS) total += counts[color] ?? 0;
  return total;
}

/** Drops zero entries; used to keep events and log entries compact. */
export function compactCounts<C extends TokenColor>(
  counts: Partial<Record<C, number>>,
): Partial<Record<C, number>> {
  const out: Partial<Record<C, number>> = {};
  for (const [color, n] of Object.entries(counts) as [C, number | undefined][]) {
    if (n) out[color] = n;
  }
  return out;
}
