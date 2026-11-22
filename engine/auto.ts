import { contextFromState } from './context';
import { GEM_COLORS, TOKEN_COLORS } from './gems';
import type { TokenColor } from './gems';
import { legalIntents } from './legal';
import type { ActionIntent, GameState } from './types';

/**
 * Deterministic fallback move used when a turn timer runs out (3.7) or a
 * disconnected player is auto-skipped (FR-5). It prefers the least intrusive
 * option: take gems, otherwise reserve blind, otherwise buy, otherwise pass.
 * Returns null when it is not this player's decision.
 */
export function autoIntent(state: GameState, playerId: string): ActionIntent | null {
  const ctx = contextFromState(state);
  const legal = legalIntents(ctx, playerId);
  if (legal.length === 0) return null;
  const player = ctx.players.find((p) => p.id === playerId)!;

  switch (ctx.phase.kind) {
    case 'chooseNoble':
      return legal[0]!;
    case 'returnTokens': {
      // Give back what the player holds most of; gold last because it is the most flexible.
      const tokens: Partial<Record<TokenColor, number>> = {};
      const held = { ...player.tokens };
      for (let i = 0; i < ctx.phase.count; i++) {
        const pool = GEM_COLORS.some((c) => held[c] > 0) ? GEM_COLORS : TOKEN_COLORS;
        const color = [...pool].sort((a, b) => held[b] - held[a])[0]!;
        held[color] -= 1;
        tokens[color] = (tokens[color] ?? 0) + 1;
      }
      return { type: 'RETURN_TOKENS', tokens };
    }
    case 'action': {
      const byType = (type: ActionIntent['type']) => legal.filter((i) => i.type === type);
      const takes = byType('TAKE_THREE');
      if (takes.length > 0) {
        // The combination drawing from the fullest piles keeps the bank balanced.
        const score = (i: ActionIntent) =>
          i.type === 'TAKE_THREE' ? i.colors.reduce((sum, c) => sum + ctx.supply[c], 0) : 0;
        return takes.reduce((best, i) => (score(i) > score(best) ? i : best));
      }
      for (const type of [
        'TAKE_TWO',
        'RESERVE_FROM_DECK',
        'RESERVE_FACE_UP',
        'BUY_FACE_UP',
        'BUY_RESERVED',
      ] as const) {
        const options = byType(type);
        if (options.length > 0) return options[0]!;
      }
      return legal[0]!;
    }
  }
}
