import { cardPoints } from './cards';
import { legalCards } from './play';
import type { ActionIntent, GameState } from './types';

/** Safe fallback intent for turn-timer expiry or disconnected-player skip. */
export function autoIntent(state: GameState, playerId: string): ActionIntent | null {
  if (state.status !== 'playing') return null;
  const seat = state.players.findIndex((p) => p.id === playerId);
  if (seat === -1 || seat !== state.currentSeat) return null;

  if (state.phase === 'bidding' || state.phase === 'kontra') {
    return { type: 'PASS' };
  }

  if (state.phase === 'playing' && state.contract) {
    const legal = legalCards(state.hands[seat]!, state.trick.plays, state.contract.strain, seat);
    if (legal.length === 0) return null;
    const strain = state.contract.strain;
    const sorted = legal.slice().sort((a, b) => cardPoints(a, strain) - cardPoints(b, strain));
    return { type: 'PLAY', card: sorted[0]! };
  }

  return null;
}
