export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];
export type Strain = Suit | 'BOY';

export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export const CARD_IDS = [
  '7S',
  '8S',
  '9S',
  '10S',
  'JS',
  'QS',
  'KS',
  'AS',
  '7H',
  '8H',
  '9H',
  '10H',
  'JH',
  'QH',
  'KH',
  'AH',
  '7D',
  '8D',
  '9D',
  '10D',
  'JD',
  'QD',
  'KD',
  'AD',
  '7C',
  '8C',
  '9C',
  '10C',
  'JC',
  'QC',
  'KC',
  'AC',
] as const;

export type CardId = (typeof CARD_IDS)[number];

export function suitOf(card: CardId): Suit {
  return card.slice(-1) as Suit;
}

export function rankOf(card: CardId): Rank {
  return card.slice(0, -1) as Rank;
}

export function makeCardId(rank: Rank, suit: Suit): CardId {
  return `${rank}${suit}` as CardId;
}

export const SEQUENCE_ORDER: readonly Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const TRUMP_POWER: readonly Rank[] = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];
export const PLAIN_POWER: readonly Rank[] = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];

export const TRUMP_POINTS: Record<Rank, number> = {
  J: 20,
  '9': 14,
  A: 11,
  '10': 10,
  K: 4,
  Q: 3,
  '8': 0,
  '7': 0,
};

export const PLAIN_POINTS: Record<Rank, number> = {
  A: 11,
  '10': 10,
  K: 4,
  Q: 3,
  J: 2,
  '9': 0,
  '8': 0,
  '7': 0,
};

export const BOY_POINTS: Record<Rank, number> = {
  A: 19,
  '10': 10,
  K: 4,
  Q: 3,
  J: 2,
  '9': 0,
  '8': 0,
  '7': 0,
};

export function cardPoints(card: CardId, strain: Strain): number {
  const rank = rankOf(card);
  if (strain === 'BOY') return BOY_POINTS[rank];
  return suitOf(card) === strain ? TRUMP_POINTS[rank] : PLAIN_POINTS[rank];
}

export function trumpRankPower(rank: Rank): number {
  return TRUMP_POWER.indexOf(rank);
}

export function plainRankPower(rank: Rank): number {
  return PLAIN_POWER.indexOf(rank);
}

export function sequenceRankIndex(rank: Rank): number {
  return SEQUENCE_ORDER.indexOf(rank);
}

/**
 * Comparable strength of `card` within a trick whose led suit is `ledSuit`.
 * Trump cards outrank all non-trumps; non-led, non-trump cards have power -1.
 */
export function trickCardStrength(card: CardId, strain: Strain, ledSuit: Suit): number {
  const s = suitOf(card);
  const r = rankOf(card);
  if (strain !== 'BOY' && s === strain) {
    return 100 + trumpRankPower(r);
  }
  if (s === ledSuit) {
    return plainRankPower(r);
  }
  return -1;
}
