import { describe, expect, it } from 'vitest';
import { getLegalActions, validateAction } from './index';
import {
  act,
  cardsOf,
  expectRejected,
  givePurchased,
  newGame,
  placeInMarket,
  player,
  setTokens,
} from './testing/helpers';
import type { GameState } from './types';

const bonusCards = (color: 'emerald' | 'ruby' | 'onyx' | 'diamond' | 'sapphire', n: number) =>
  cardsOf((c) => c.level === 1 && c.bonus === color)
    .slice(0, n)
    .map((c) => c.id);

describe('token limit (2.4)', () => {
  it('makes the player return down to 10 before the turn ends', () => {
    let state = newGame(2);
    setTokens(state, 'p1', { diamond: 3, sapphire: 3, emerald: 3 });
    state = act(state, 'p1', { type: 'TAKE_THREE', colors: ['ruby', 'onyx', 'diamond'] });
    expect(state.phase).toEqual({ kind: 'returnTokens', count: 2 });
    expect(state.currentPlayerIndex).toBe(0);

    expectRejected(state, 'p2', { type: 'TAKE_TWO', color: 'ruby' }, 'NOT_YOUR_TURN');
    expectRejected(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' }, 'WRONG_PHASE');
    expectRejected(
      state,
      'p1',
      { type: 'RETURN_TOKENS', tokens: { diamond: 1 } },
      'WRONG_RETURN_COUNT',
    );
    expectRejected(
      state,
      'p1',
      { type: 'RETURN_TOKENS', tokens: { ruby: 2 } },
      'RETURN_EXCEEDS_HOLDINGS',
    );

    // Tokens just taken may be returned.
    state = act(state, 'p1', { type: 'RETURN_TOKENS', tokens: { ruby: 1, onyx: 1 } });
    expect(player(state, 'p1').tokens).toMatchObject({
      diamond: 4,
      sapphire: 3,
      emerald: 3,
      ruby: 0,
      onyx: 0,
    });
    expect(state.supply.ruby).toBe(4);
    expect(state.phase).toEqual({ kind: 'action' });
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('counts gold toward the limit, and gold may be returned', () => {
    let state = newGame(2);
    setTokens(state, 'p1', { diamond: 4, sapphire: 4, emerald: 2 });
    state = act(state, 'p1', { type: 'RESERVE_FROM_DECK', level: 1 });
    expect(state.phase).toEqual({ kind: 'returnTokens', count: 1 });
    state = act(state, 'p1', { type: 'RETURN_TOKENS', tokens: { gold: 1 } });
    expect(player(state, 'p1').tokens.gold).toBe(0);
    expect(state.supply.gold).toBe(5);
  });

  it('does not prompt at exactly 10 tokens', () => {
    let state = newGame(2);
    setTokens(state, 'p1', { diamond: 4, sapphire: 3 });
    state = act(state, 'p1', { type: 'TAKE_THREE', colors: ['ruby', 'onyx', 'emerald'] });
    expect(state.phase).toEqual({ kind: 'action' });
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('lists every way to return the excess', () => {
    let state = newGame(2);
    setTokens(state, 'p1', { diamond: 4, sapphire: 4 });
    state = act(state, 'p1', { type: 'TAKE_THREE', colors: ['emerald', 'ruby', 'onyx'] });
    const returns = getLegalActions(state, 'p1');
    expect(returns).toHaveLength(5);
    expect(returns.every((a) => a.type === 'RETURN_TOKENS')).toBe(true);
    for (const a of returns) expect(validateAction(state, a)).toBeNull();
  });

  it('rejects malformed returns', () => {
    let state = newGame(2);
    setTokens(state, 'p1', { diamond: 4, sapphire: 4 });
    state = act(state, 'p1', { type: 'TAKE_THREE', colors: ['emerald', 'ruby', 'onyx'] });
    // @ts-expect-error tokens must be an object
    expectRejected(state, 'p1', { type: 'RETURN_TOKENS', tokens: 1 }, 'MALFORMED_ACTION');
    expectRejected(
      state,
      'p1',
      { type: 'RETURN_TOKENS', tokens: { ruby: -1 } },
      'MALFORMED_ACTION',
    );
    expectRejected(
      state,
      'p1',
      { type: 'RETURN_TOKENS', tokens: { ruby: 0.5 } },
      'MALFORMED_ACTION',
    );
    const unknownColor = { amber: 1 } as never; // not a token color
    expectRejected(
      state,
      'p1',
      { type: 'RETURN_TOKENS', tokens: unknownColor },
      'MALFORMED_ACTION',
    );
  });

  it('cannot return tokens outside the return step', () => {
    expectRejected(newGame(2), 'p1', { type: 'RETURN_TOKENS', tokens: {} }, 'WRONG_PHASE');
  });
});

describe('noble visits (2.4)', () => {
  function withNobles(state: GameState, ids: string[]): GameState {
    state.nobles = ids;
    return state;
  }

  it('visits at the end of any turn once bonuses meet the requirement', () => {
    const state = withNobles(newGame(2), ['N09', 'N01', 'N02']); // N09: 4 emerald + 4 ruby
    givePurchased(state, 'p1', [...bonusCards('emerald', 4), ...bonusCards('ruby', 4)]);
    const next = act(state, 'p1', { type: 'TAKE_TWO', color: 'diamond' });
    expect(player(next, 'p1').nobles).toEqual(['N09']);
    expect(next.nobles).toEqual(['N01', 'N02']);
    expect(next.log[0]!.events).toContainEqual({
      type: 'NOBLE_VISITED',
      playerId: 'p1',
      nobleId: 'N09',
    });
  });

  it('counts bonuses only, never tokens', () => {
    const state = withNobles(newGame(2), ['N09']);
    givePurchased(state, 'p1', [...bonusCards('emerald', 3), ...bonusCards('ruby', 4)]);
    setTokens(state, 'p1', { emerald: 4 });
    const next = act(state, 'p1', { type: 'TAKE_TWO', color: 'diamond' });
    expect(player(next, 'p1').nobles).toEqual([]);
  });

  it('arrives in the same turn as the purchase that completes the requirement', () => {
    const state = withNobles(newGame(2), ['N09']);
    givePurchased(state, 'p1', [...bonusCards('emerald', 3), ...bonusCards('ruby', 4)]);
    const emeraldCard = bonusCards('emerald', 8)[7]!; // 1-point emerald card
    placeInMarket(state, emeraldCard, 0);
    setTokens(state, 'p1', { gold: 4 });
    const next = act(state, 'p1', { type: 'BUY_FACE_UP', cardId: emeraldCard });
    expect(player(next, 'p1').nobles).toEqual(['N09']);
  });

  it('lets the player choose when several qualify, one per turn', () => {
    let state = withNobles(newGame(2), ['N09', 'N10', 'N01']); // N10: 4 ruby + 4 onyx
    givePurchased(state, 'p1', [
      ...bonusCards('emerald', 4),
      ...bonusCards('ruby', 4),
      ...bonusCards('onyx', 4),
    ]);
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'diamond' });
    expect(state.phase).toEqual({ kind: 'chooseNoble', options: ['N09', 'N10'] });
    expect(getLegalActions(state, 'p1').map((a) => a.type)).toEqual([
      'CHOOSE_NOBLE',
      'CHOOSE_NOBLE',
    ]);
    expectRejected(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' }, 'WRONG_PHASE');
    expectRejected(state, 'p1', { type: 'CHOOSE_NOBLE', nobleId: 'N01' }, 'NOBLE_NOT_AVAILABLE');
    // @ts-expect-error nobleId must be a string
    expectRejected(state, 'p1', { type: 'CHOOSE_NOBLE', nobleId: 3 }, 'MALFORMED_ACTION');

    state = act(state, 'p1', { type: 'CHOOSE_NOBLE', nobleId: 'N10' });
    expect(player(state, 'p1').nobles).toEqual(['N10']);
    expect(state.currentPlayerIndex).toBe(1);

    // The other noble visits at the end of the player's next turn.
    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'sapphire' });
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'emerald' });
    expect(player(state, 'p1').nobles).toEqual(['N10', 'N09']);
  });

  it('cannot choose a noble outside the choice step', () => {
    expectRejected(newGame(2), 'p1', { type: 'CHOOSE_NOBLE', nobleId: 'N01' }, 'WRONG_PHASE');
  });

  it('resolves the token limit before the noble visit', () => {
    let state = withNobles(newGame(2), ['N09']);
    givePurchased(state, 'p1', [...bonusCards('emerald', 4), ...bonusCards('ruby', 4)]);
    setTokens(state, 'p1', { diamond: 4, sapphire: 4 });
    state = act(state, 'p1', { type: 'TAKE_THREE', colors: ['emerald', 'ruby', 'onyx'] });
    expect(state.phase).toEqual({ kind: 'returnTokens', count: 1 });
    expect(player(state, 'p1').nobles).toEqual([]);
    state = act(state, 'p1', { type: 'RETURN_TOKENS', tokens: { onyx: 1 } });
    expect(player(state, 'p1').nobles).toEqual(['N09']);
    expect(state.log.at(-1)!.events.map((e) => e.type)).toEqual([
      'TOKENS_RETURNED',
      'NOBLE_VISITED',
    ]);
  });
});
