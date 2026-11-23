import { rankOf, suitOf, trickCardStrength, trumpRankPower } from './cards';
import type { CardId, Strain, Suit } from './cards';
import type { RuleErrorCode } from './errors';
import type { TrickPlay } from './types';
import { teamOf } from './types';

export function trickWinner(plays: readonly TrickPlay[], strain: Strain): TrickPlay {
  const ledSuit: Suit = suitOf(plays[0]!.card);
  let best = plays[0]!;
  let bestStrength = trickCardStrength(best.card, strain, ledSuit);
  for (let i = 1; i < plays.length; i++) {
    const p = plays[i]!;
    const strength = trickCardStrength(p.card, strain, ledSuit);
    if (strength > bestStrength) {
      best = p;
      bestStrength = strength;
    }
  }
  return best;
}

export function legalCards(
  hand: readonly CardId[],
  trickPlays: readonly TrickPlay[],
  strain: Strain,
  seat: number,
): CardId[] {
  if (trickPlays.length === 0) return [...hand];
  const ledSuit = suitOf(trickPlays[0]!.card);
  const ofLed = hand.filter((c) => suitOf(c) === ledSuit);
  if (ofLed.length > 0) return ofLed;
  if (strain === 'BOY') return [...hand];

  const currentBest = trickWinner(trickPlays, strain);
  if (teamOf(currentBest.seat) === teamOf(seat)) {
    return [...hand];
  }

  const trumps = hand.filter((c) => suitOf(c) === strain);
  if (trumps.length === 0) return [...hand];

  let highestTrumpPower = -1;
  for (const p of trickPlays) {
    if (suitOf(p.card) === strain) {
      const power = trumpRankPower(rankOf(p.card));
      if (power > highestTrumpPower) highestTrumpPower = power;
    }
  }

  const higherTrumps = trumps.filter((c) => trumpRankPower(rankOf(c)) > highestTrumpPower);
  return higherTrumps.length > 0 ? higherTrumps : trumps;
}

export function playCardError(
  hand: readonly CardId[],
  trickPlays: readonly TrickPlay[],
  strain: Strain,
  seat: number,
  card: CardId,
): RuleErrorCode | null {
  if (!hand.includes(card)) return 'CARD_NOT_IN_HAND';
  if (trickPlays.length === 0) return null;

  const ledSuit = suitOf(trickPlays[0]!.card);
  if (hand.some((c) => suitOf(c) === ledSuit)) {
    return suitOf(card) === ledSuit ? null : 'MUST_FOLLOW_SUIT';
  }
  if (strain === 'BOY') return null;

  const currentBest = trickWinner(trickPlays, strain);
  if (teamOf(currentBest.seat) === teamOf(seat)) return null;

  const trumps = hand.filter((c) => suitOf(c) === strain);
  if (trumps.length === 0) return null;
  if (suitOf(card) !== strain) return 'MUST_TRUMP';

  let highestTrumpPower = -1;
  for (const p of trickPlays) {
    if (suitOf(p.card) === strain) {
      const power = trumpRankPower(rankOf(p.card));
      if (power > highestTrumpPower) highestTrumpPower = power;
    }
  }
  const hasHigher = trumps.some((c) => trumpRankPower(rankOf(c)) > highestTrumpPower);
  if (hasHigher && trumpRankPower(rankOf(card)) <= highestTrumpPower) {
    return 'MUST_OVERTRUMP';
  }
  return null;
}
