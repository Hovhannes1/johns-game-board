import { bonusesOf, cardById, currentPlayer } from './derive';
import type { GemCounts, TokenCounts } from './gems';
import type { CardDef, GameState, GameStatus, PerLevel, RuleSet, TurnPhase } from './types';

/**
 * The minimal, read-only picture of a game needed to validate an action and
 * enumerate legal moves. It can be built from the full server state or from a
 * player's redacted view, so the server and the client share one rules
 * implementation (server authority, client-side highlighting: FR-10).
 */
export interface PlayerContext {
  id: string;
  tokens: TokenCounts;
  bonuses: GemCounts;
  /** Reserved cards; null when hidden from whoever built the context. */
  reserved: (CardDef | null)[];
}

export interface RulesContext {
  status: GameStatus;
  rules: RuleSet;
  phase: TurnPhase;
  currentPlayerId: string;
  supply: TokenCounts;
  market: PerLevel<(CardDef | null)[]>;
  deckCounts: PerLevel<number>;
  players: readonly PlayerContext[];
}

export function contextFromState(state: GameState): RulesContext {
  const { catalog } = state;
  const resolve = (slots: (string | null)[]) =>
    slots.map((id) => (id === null ? null : cardById(catalog, id)));
  return {
    status: state.status,
    rules: state.rules,
    phase: state.phase,
    currentPlayerId: currentPlayer(state).id,
    supply: state.supply,
    market: {
      1: resolve(state.market[1]),
      2: resolve(state.market[2]),
      3: resolve(state.market[3]),
    },
    deckCounts: { 1: state.decks[1].length, 2: state.decks[2].length, 3: state.decks[3].length },
    players: state.players.map((p) => ({
      id: p.id,
      tokens: p.tokens,
      bonuses: bonusesOf(catalog, p),
      reserved: p.reserved.map((r) => cardById(catalog, r.cardId)),
    })),
  };
}
