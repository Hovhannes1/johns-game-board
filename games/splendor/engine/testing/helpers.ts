/**
 * Test-only helpers for building precise game situations. These mutate states
 * directly, which production code never does.
 */
import { expect } from 'vitest';
import { basePack } from '../../data';
import { applyAction, createGame, validateAction } from '../index';
import type { RuleErrorCode } from '../errors';
import { toTokenCounts } from '../gems';
import type { TokenColor } from '../gems';
import { LEVELS } from '../types';
import type { ActionIntent, CardDef, GameState, Level, PlayerSeat } from '../types';

export const SEED = '0123456789abcdef'.repeat(4);

export function seats(n: number): PlayerSeat[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
}

export function newGame(players = 2, seed = SEED, startingPlayerIndex = 0): GameState {
  return createGame({ players: seats(players), pack: basePack, startingPlayerIndex }, seed);
}

export function act(state: GameState, playerId: string, intent: ActionIntent): GameState {
  const result = applyAction(state, { ...intent, playerId });
  if (!result.ok) throw new Error(`Expected ${intent.type} to succeed: ${result.error.message}`);
  return result.state;
}

export function expectRejected(
  state: GameState,
  playerId: string,
  intent: ActionIntent,
  code: RuleErrorCode,
): void {
  const error = validateAction(state, { ...intent, playerId });
  expect(error?.code).toBe(code);
  const result = applyAction(state, { ...intent, playerId });
  expect(result.ok).toBe(false);
}

export function player(state: GameState, id: string) {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`No player ${id}`);
  return p;
}

export function card(id: string): CardDef {
  const c = basePack.cards.find((x) => x.id === id);
  if (!c) throw new Error(`No card ${id}`);
  return c;
}

export function setTokens(
  state: GameState,
  playerId: string,
  tokens: Partial<Record<TokenColor, number>>,
): void {
  const p = player(state, playerId);
  const next = toTokenCounts(tokens);
  for (const color of Object.keys(next) as TokenColor[]) {
    // Keep the token economy conserved: move the difference to or from the supply.
    state.supply[color] -= next[color] - p.tokens[color];
    p.tokens[color] = next[color];
  }
}

export function setSupply(state: GameState, supply: Partial<Record<TokenColor, number>>): void {
  state.supply = toTokenCounts(supply);
}

/** Removes a card from wherever it sits in decks or market (market slot is refilled). */
export function extractCard(state: GameState, cardId: string): void {
  for (const level of LEVELS) {
    const deckIndex = state.decks[level].indexOf(cardId);
    if (deckIndex >= 0) {
      state.decks[level].splice(deckIndex, 1);
      return;
    }
    const slot = state.market[level].indexOf(cardId);
    if (slot >= 0) {
      state.market[level][slot] = state.decks[level].shift() ?? null;
      return;
    }
  }
  throw new Error(`Card ${cardId} is not in a deck or the market`);
}

/** Gives a player purchased cards (bonuses) directly. */
export function givePurchased(state: GameState, playerId: string, cardIds: string[]): void {
  for (const id of cardIds) {
    extractCard(state, id);
    player(state, playerId).purchased.push(id);
  }
}

export function giveReserved(
  state: GameState,
  playerId: string,
  cardIds: string[],
  fromDeck = false,
): void {
  for (const id of cardIds) {
    extractCard(state, id);
    player(state, playerId).reserved.push({ cardId: id, fromDeck });
  }
}

/** Puts a specific card face up in a market slot, returning the previous card to its deck. */
export function placeInMarket(state: GameState, cardId: string, slot = 0): void {
  const level = card(cardId).level;
  const previous = state.market[level][slot];
  extractCard(state, cardId);
  if (previous && previous !== cardId) state.decks[level].push(previous);
  state.market[level][slot] = cardId;
}

export function cardsOf(predicate: (c: CardDef) => boolean): CardDef[] {
  return basePack.cards.filter(predicate);
}

export function allCardIds(state: GameState): string[] {
  const ids: string[] = [];
  for (const level of LEVELS) {
    ids.push(...state.decks[level]);
    for (const id of state.market[level]) if (id) ids.push(id);
  }
  for (const p of state.players) {
    ids.push(...p.purchased, ...p.reserved.map((r) => r.cardId));
  }
  return ids;
}

export function emptyDeck(state: GameState, level: Level): void {
  state.decks[level] = [];
}
