import { applyAction, getLegalActions } from '../index';
import type { Rng } from '../rng';
import type { GameAction, GameState } from '../types';

/**
 * Picks a random legal action. With `buyBias` > 0 it prefers purchases, which
 * keeps random games to a realistic length while still exploring odd states.
 */
export function randomAction(state: GameState, rng: Rng, buyBias = 0.5): GameAction {
  const current = state.players[state.currentPlayerIndex]!;
  const legal = getLegalActions(state, current.id);
  if (legal.length === 0) throw new Error('No legal actions for the current player');
  const buys = legal.filter((a) => a.type === 'BUY_FACE_UP' || a.type === 'BUY_RESERVED');
  const pool = buys.length > 0 && rng.nextInt(1000) < buyBias * 1000 ? buys : legal;
  return pool[rng.nextInt(pool.length)]!;
}

export function playRandomGame(
  initial: GameState,
  rng: Rng,
  options: { maxActions?: number; buyBias?: number; onStep?: (state: GameState) => void } = {},
): GameState {
  const { maxActions = 5000, buyBias = 0.5, onStep } = options;
  let state = initial;
  for (let i = 0; i < maxActions && state.status === 'playing'; i++) {
    const result = applyAction(state, randomAction(state, rng, buyBias));
    if (!result.ok) throw new Error(`Legal action rejected: ${result.error.code}`);
    state = result.state;
    onStep?.(state);
  }
  return state;
}
