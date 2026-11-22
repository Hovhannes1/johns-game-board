/**
 * Splendor rules engine: pure, deterministic, framework-free (FR-15).
 *
 *   createGame(config, seed)        -> GameState
 *   getLegalActions(state, playerId) -> GameAction[]
 *   applyAction(state, action)       -> { ok, state } | { ok: false, error }
 *   getPublicView(state, viewerId)   -> GameView (redacted per viewer)
 */
import { applyAction } from './apply';
import { contextFromState } from './context';
import { legalIntents } from './legal';
import { createGame } from './setup';
import type { GameAction, GameConfig, GameState } from './types';

export { applyAction, computeResult, scoreboard, validateAction } from './apply';
export { autoIntent } from './auto';
export type { ApplyResult } from './apply';
export { contextFromState } from './context';
export type { PlayerContext, RulesContext } from './context';
export { bonusesOf, meetsRequirement, pointsOf } from './derive';
export { phaseLabels, ruleError, ruleMessages } from './errors';
export type { RuleError, RuleErrorCode } from './errors';
export * from './gems';
export { computePayment } from './payment';
export type { PaymentPlan } from './payment';
export { createRng, isValidSeed, shuffle } from './rng';
export type { Rng } from './rng';
export { BASE_RULES, TAKE_DIFFERENT_MAX, resolveRules } from './rules';
export { createGame } from './setup';
export * from './types';
export { allowedActionTypes, validateIntent } from './validate';
export {
  contextFromView,
  explainIntentForViewer,
  getPublicView,
  legalIntentsForViewer,
} from './view';
export type { GameView, PlayerView, ReservedCardView } from './view';

/** All legal actions for a player right now; empty when it is not their turn. */
export function getLegalActions(state: GameState, playerId: string): GameAction[] {
  return legalIntents(contextFromState(state), playerId).map((intent) => ({ ...intent, playerId }));
}

/**
 * Rebuilds a game from its config, seed and action list (FR-17). Throws if any
 * action is rejected, which signals a corrupt or tampered log.
 */
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

/** The action list recorded in a state's log, ready for `replayGame`. */
export function actionsFromLog(state: GameState): GameAction[] {
  return state.log.map((entry) => ({ ...entry.action, playerId: entry.playerId }) as GameAction);
}
