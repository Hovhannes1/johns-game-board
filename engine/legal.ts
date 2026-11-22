import type { RulesContext } from './context';
import type { ActionIntent } from './types';
import { mainActionCandidates, returnCombinations, validateIntent } from './validate';

/**
 * Every legal intent for `playerId` in the given context. Empty when it is not
 * that player's turn or the game is over. Every returned intent passes
 * `validateIntent`, because candidates are filtered through it.
 */
export function legalIntents(ctx: RulesContext, playerId: string): ActionIntent[] {
  if (ctx.status === 'finished' || ctx.currentPlayerId !== playerId) return [];
  const player = ctx.players.find((p) => p.id === playerId);
  if (!player) return [];

  const isLegal = (intent: ActionIntent) => validateIntent(ctx, playerId, intent) === null;

  switch (ctx.phase.kind) {
    case 'returnTokens':
      return returnCombinations(player.tokens, ctx.phase.count)
        .map((tokens): ActionIntent => ({ type: 'RETURN_TOKENS', tokens }))
        .filter(isLegal);
    case 'chooseNoble':
      return ctx.phase.options
        .map((nobleId): ActionIntent => ({ type: 'CHOOSE_NOBLE', nobleId }))
        .filter(isLegal);
    case 'action': {
      const main = mainActionCandidates(ctx, player).filter(isLegal);
      // Decision 2.5: PASS exists only so a player with no legal action cannot deadlock the game.
      return main.length > 0 ? main : [{ type: 'PASS' }];
    }
  }
}
