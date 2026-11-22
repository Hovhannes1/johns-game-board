import { emptyGems, GEM_COLORS } from './gems';
import type { GemCounts } from './gems';
import type { CardDef, GameCatalog, GameState, NobleDef, PlayerState } from './types';

export function cardById(catalog: GameCatalog, id: string): CardDef {
  const card = catalog.cards[id];
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export function nobleById(catalog: GameCatalog, id: string): NobleDef {
  const noble = catalog.nobles[id];
  if (!noble) throw new Error(`Unknown noble id: ${id}`);
  return noble;
}

/** Permanent gem bonuses from purchased cards. */
export function bonusesOf(catalog: GameCatalog, player: PlayerState): GemCounts {
  const bonuses = emptyGems();
  for (const id of player.purchased) bonuses[cardById(catalog, id).bonus] += 1;
  return bonuses;
}

/** Prestige from purchased cards plus nobles. */
export function pointsOf(catalog: GameCatalog, player: PlayerState): number {
  let points = 0;
  for (const id of player.purchased) points += cardById(catalog, id).points;
  for (const id of player.nobles) points += nobleById(catalog, id).points;
  return points;
}

export function meetsRequirement(bonuses: GemCounts, requires: GemCounts): boolean {
  return GEM_COLORS.every((color) => bonuses[color] >= requires[color]);
}

export function currentPlayer(state: GameState): PlayerState {
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error('Corrupt state: current player index out of range');
  return player;
}
