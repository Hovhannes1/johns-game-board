import type { Bid, GameState } from './types';
import { MAX_BID, MIN_BID, teamOf } from './types';

export function isValidBid(high: { seat: number; bid: Bid } | null, next: Bid): boolean {
  if (!Number.isInteger(next.value) || next.value < MIN_BID || next.value > MAX_BID) {
    return false;
  }
  if (!high) return true;
  if (high.bid.kaput) {
    return next.kaput && next.value > high.bid.value;
  }
  return next.kaput || next.value > high.bid.value;
}

export function canKontra(state: GameState, seat: number): boolean {
  return (
    state.phase === 'bidding' &&
    state.bidding.high !== null &&
    teamOf(seat) !== teamOf(state.bidding.high.seat)
  );
}

export function canRekontra(state: GameState, seat: number): boolean {
  return (
    state.phase === 'kontra' &&
    state.bidding.high !== null &&
    teamOf(seat) === teamOf(state.bidding.high.seat)
  );
}
