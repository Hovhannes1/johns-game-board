import { applyAction } from './apply';
import { createGame } from './setup';
import type { GameAction, GameConfig, GameState } from './types';

export { applyAction } from './apply';
export type { ApplyResult } from './apply';
export { autoIntent } from './auto';
export { canKontra, canRekontra, isValidBid } from './bidding';
export * from './cards';
export { compareCombos, detectBlot, detectCombos, resolveCombos } from './combos';
export { ruleError, ruleMessages } from './errors';
export type { RuleError, RuleErrorCode } from './errors';
export { legalCards, playCardError, trickWinner } from './play';
export { checkMatchEnd, contractMultiplier, scoreRound, toSai } from './scoring';
export { createGame, dealHands } from './setup';
export * from './types';
export { getPublicView } from './view';
export type { AnnouncedComboSummary, GameView, PlayerView } from './view';

export function replayGame(
  config: GameConfig,
  seed: string,
  actions: readonly GameAction[],
): GameState {
  let state = createGame(config, seed);
  actions.forEach((action, index) => {
    const result = applyAction(state, action);
    if (!result.ok) {
      throw new Error(`Replay failed at action ${index + 1}: ${result.error.code}`);
    }
    state = result.state;
  });
  return state;
}

export function actionsFromLog(state: GameState): GameAction[] {
  return state.log.map((entry) => ({ ...entry.action, playerId: entry.playerId }));
}
