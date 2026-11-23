import {
  RANKS,
  SEQUENCE_ORDER,
  SUITS,
  makeCardId,
  rankOf,
  sequenceRankIndex,
  suitOf,
} from './cards';
import type { CardId, Rank, Strain, Suit } from './cards';
import type { BlotInfo, Combo, TeamIndex } from './types';
import { teamOf } from './types';

const FOUR_VALUES_TRUMP: Record<Rank, number> = {
  J: 200,
  '9': 140,
  A: 110,
  '10': 100,
  K: 100,
  Q: 100,
  '8': 0,
  '7': 0,
};

const FOUR_VALUES_BOY: Record<Rank, number> = {
  A: 190,
  '10': 100,
  K: 100,
  Q: 100,
  J: 100,
  '9': 0,
  '8': 0,
  '7': 0,
};

const FOUR_ORDER_TRUMP: readonly Rank[] = ['Q', 'K', '10', 'A', '9', 'J'];
const FOUR_ORDER_BOY: readonly Rank[] = ['J', 'Q', 'K', '10', 'A'];

/** Detects all sequences (Terz/50/100) and four-of-a-kinds in a single hand. */
export function detectCombos(hand: readonly CardId[], seat: number, strain: Strain): Combo[] {
  const team = teamOf(seat);
  const combos: Combo[] = [];
  let seqIdx = 0;

  // 1. Sequences per suit
  for (const suit of SUITS) {
    const suitCards = hand
      .filter((c) => suitOf(c) === suit)
      .sort((a, b) => sequenceRankIndex(rankOf(a)) - sequenceRankIndex(rankOf(b)));

    let start = 0;
    while (start < suitCards.length) {
      let end = start;
      while (
        end + 1 < suitCards.length &&
        sequenceRankIndex(rankOf(suitCards[end + 1]!)) ===
          sequenceRankIndex(rankOf(suitCards[end]!)) + 1
      ) {
        end += 1;
      }
      const len = end - start + 1;
      if (len >= 3) {
        const cards = suitCards.slice(start, end + 1);
        const topRank = rankOf(cards[cards.length - 1]!);
        const kind = len === 3 ? 'TERZ' : len === 4 ? 'FIFTY' : 'HUNDRED';
        const points = len === 3 ? 20 : len === 4 ? 50 : 100;
        combos.push({
          id: `s${seat}-c${seqIdx++}`,
          seat,
          team,
          kind,
          cards,
          points,
          topRank,
          suit,
        });
      }
      start = end + 1;
    }
  }

  // 2. Four-of-a-kind
  for (const rank of RANKS) {
    const ofRank = hand.filter((c) => rankOf(c) === rank);
    if (ofRank.length === 4) {
      const points = strain === 'BOY' ? FOUR_VALUES_BOY[rank] : FOUR_VALUES_TRUMP[rank];
      if (points > 0) {
        const cards = SUITS.map((s) => makeCardId(rank, s));
        combos.push({
          id: `s${seat}-c${seqIdx++}`,
          seat,
          team,
          kind: 'FOUR',
          cards,
          points,
          topRank: rank,
          suit: null,
        });
      }
    }
  }

  return combos;
}

/** Detects if any player holds both K and Q of the trump suit. */
export function detectBlot(hands: readonly (readonly CardId[])[], strain: Strain): BlotInfo | null {
  if (strain === 'BOY') return null;
  const king = makeCardId('K', strain as Suit);
  const queen = makeCardId('Q', strain as Suit);
  for (let seat = 0; seat < 4; seat++) {
    const hand = hands[seat]!;
    if (hand.includes(king) && hand.includes(queen)) {
      return { seat, team: teamOf(seat), played: 0 };
    }
  }
  return null;
}

/**
 * Returns > 0 if `a` outranks `b`, < 0 if `b` outranks `a`.
 * Priority: points -> four-of-a-kind beats 100 -> top card -> trump suit -> seat order from dealer's left.
 */
export function compareCombos(a: Combo, b: Combo, strain: Strain, dealer: number): number {
  if (a.points !== b.points) return a.points - b.points;

  // Any four-of-a-kind outranks the 100 sequence bonus.
  if (a.kind === 'FOUR' && b.kind !== 'FOUR') return 1;
  if (b.kind === 'FOUR' && a.kind !== 'FOUR') return -1;

  if (a.kind === 'FOUR' && b.kind === 'FOUR') {
    const order = strain === 'BOY' ? FOUR_ORDER_BOY : FOUR_ORDER_TRUMP;
    const diff = order.indexOf(a.topRank) - order.indexOf(b.topRank);
    if (diff !== 0) return diff;
  } else {
    const diff = SEQUENCE_ORDER.indexOf(a.topRank) - SEQUENCE_ORDER.indexOf(b.topRank);
    if (diff !== 0) return diff;
    if (strain !== 'BOY') {
      const aTrump = a.suit === strain ? 1 : 0;
      const bTrump = b.suit === strain ? 1 : 0;
      if (aTrump !== bTrump) return aTrump - bTrump;
    }
  }

  // First player clockwise from dealer's left wins ties.
  const firstSeat = (dealer + 1) % 4;
  const aDist = (a.seat - firstSeat + 4) % 4;
  const bDist = (b.seat - firstSeat + 4) % 4;
  return bDist - aDist;
}

function strongestForTeam(
  combos: readonly Combo[],
  team: TeamIndex,
  strain: Strain,
  dealer: number,
): Combo | null {
  const mine = combos.filter((c) => c.team === team);
  if (mine.length === 0) return null;
  return mine.reduce((best, cur) => (compareCombos(cur, best, strain, dealer) > 0 ? cur : best));
}

export function resolveCombos(
  bySeat: readonly (readonly Combo[])[],
  strain: Strain,
  dealer: number,
): { winningTeam: TeamIndex | null; valid: Combo[] } {
  const all = bySeat.flat();
  if (all.length === 0) return { winningTeam: null, valid: [] };

  const best0 = strongestForTeam(all, 0, strain, dealer);
  const best1 = strongestForTeam(all, 1, strain, dealer);

  let winningTeam: TeamIndex;
  if (best0 && !best1) winningTeam = 0;
  else if (!best0 && best1) winningTeam = 1;
  else if (best0 && best1) {
    winningTeam = compareCombos(best0, best1, strain, dealer) > 0 ? 0 : 1;
  } else {
    return { winningTeam: null, valid: [] };
  }

  return {
    winningTeam,
    valid: all.filter((c) => c.team === winningTeam),
  };
}
