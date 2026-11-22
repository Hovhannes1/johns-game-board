import { describe, expect, it } from 'vitest';
import { getLegalActions } from './index';
import { act, expectRejected, newGame, player, setSupply, setTokens } from './testing/helpers';

describe('take 3 different gems (2.3 action 1)', () => {
  it('moves one token of each chosen color from supply to player and ends the turn', () => {
    const state = act(newGame(2), 'p1', {
      type: 'TAKE_THREE',
      colors: ['ruby', 'onyx', 'diamond'],
    });
    expect(player(state, 'p1').tokens).toMatchObject({ ruby: 1, onyx: 1, diamond: 1, emerald: 0 });
    expect(state.supply).toMatchObject({ ruby: 3, onyx: 3, diamond: 3, emerald: 4 });
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.log.at(-1)?.events[0]).toEqual({
      type: 'TOKENS_TAKEN',
      playerId: 'p1',
      tokens: { ruby: 1, onyx: 1, diamond: 1 },
    });
  });

  it('rejects duplicates, wrong counts, gold and unknown colors', () => {
    const state = newGame(2);
    expectRejected(
      state,
      'p1',
      { type: 'TAKE_THREE', colors: ['ruby', 'ruby', 'onyx'] },
      'DUPLICATE_COLORS',
    );
    expectRejected(
      state,
      'p1',
      { type: 'TAKE_THREE', colors: ['ruby', 'onyx'] },
      'WRONG_COLOR_COUNT',
    );
    expectRejected(state, 'p1', { type: 'TAKE_THREE', colors: [] }, 'WRONG_COLOR_COUNT');
    expectRejected(
      state,
      'p1',
      { type: 'TAKE_THREE', colors: ['ruby', 'onyx', 'diamond', 'emerald'] },
      'WRONG_COLOR_COUNT',
    );
    expectRejected(
      state,
      'p1',
      // @ts-expect-error gold is not a gem color
      { type: 'TAKE_THREE', colors: ['ruby', 'onyx', 'gold'] },
      'MALFORMED_ACTION',
    );
    // @ts-expect-error colors must be an array
    expectRejected(state, 'p1', { type: 'TAKE_THREE', colors: 'ruby' }, 'MALFORMED_ACTION');
  });

  it('rejects a color with no tokens left', () => {
    const state = newGame(2);
    setSupply(state, { diamond: 4, sapphire: 4, emerald: 4, ruby: 0, onyx: 4, gold: 5 });
    expectRejected(
      state,
      'p1',
      { type: 'TAKE_THREE', colors: ['ruby', 'onyx', 'diamond'] },
      'COLOR_UNAVAILABLE',
    );
  });

  it('requires taking every remaining color when fewer than 3 colors remain (2.5)', () => {
    const state = newGame(2);
    setSupply(state, { ruby: 2, onyx: 1, gold: 5 });
    expectRejected(state, 'p1', { type: 'TAKE_THREE', colors: ['ruby'] }, 'WRONG_COLOR_COUNT');
    const next = act(state, 'p1', { type: 'TAKE_THREE', colors: ['onyx', 'ruby'] });
    expect(player(next, 'p1').tokens).toMatchObject({ ruby: 1, onyx: 1 });

    const single = newGame(2);
    setSupply(single, { emerald: 1, gold: 5 });
    const legal = getLegalActions(single, 'p1').filter((a) => a.type === 'TAKE_THREE');
    expect(legal).toEqual([{ type: 'TAKE_THREE', colors: ['emerald'], playerId: 'p1' }]);
    expect(act(single, 'p1', { type: 'TAKE_THREE', colors: ['emerald'] }).supply.emerald).toBe(0);
  });

  it('cannot take gems when none remain (gold is never taken this way)', () => {
    const state = newGame(2);
    setSupply(state, { gold: 5 });
    expectRejected(state, 'p1', { type: 'TAKE_THREE', colors: ['ruby'] }, 'NO_TOKENS_AVAILABLE');
  });

  it('lists all 10 color combinations at the start of a game', () => {
    const takes = getLegalActions(newGame(2), 'p1').filter((a) => a.type === 'TAKE_THREE');
    expect(takes).toHaveLength(10);
  });
});

describe('take 2 of the same gem (2.3 action 2)', () => {
  it('is allowed when at least 4 remain before taking', () => {
    const state = act(newGame(2), 'p1', { type: 'TAKE_TWO', color: 'sapphire' });
    expect(player(state, 'p1').tokens.sapphire).toBe(2);
    expect(state.supply.sapphire).toBe(2);
  });

  it('is rejected when fewer than 4 remain', () => {
    const state = newGame(2);
    setTokens(state, 'p2', { sapphire: 1 });
    expect(state.supply.sapphire).toBe(3);
    expectRejected(state, 'p1', { type: 'TAKE_TWO', color: 'sapphire' }, 'TAKE_TWO_NEEDS_FOUR');
  });

  it('rejects gold and malformed colors', () => {
    const state = newGame(2);
    // @ts-expect-error gold cannot be taken
    expectRejected(state, 'p1', { type: 'TAKE_TWO', color: 'gold' }, 'MALFORMED_ACTION');
  });
});

describe('turn and input checks', () => {
  it('only the current player may act', () => {
    const state = newGame(2);
    expectRejected(state, 'p2', { type: 'TAKE_TWO', color: 'ruby' }, 'NOT_YOUR_TURN');
    expectRejected(state, 'nobody', { type: 'TAKE_TWO', color: 'ruby' }, 'UNKNOWN_PLAYER');
    expect(getLegalActions(state, 'p2')).toEqual([]);
    expect(getLegalActions(state, 'nobody')).toEqual([]);
  });

  it('rejects unknown action types', () => {
    const state = newGame(2);
    // @ts-expect-error not a real action
    expectRejected(state, 'p1', { type: 'STEAL' }, 'MALFORMED_ACTION');
  });

  it('turns proceed clockwise and wrap into a new round', () => {
    let state = newGame(3, undefined, 1);
    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'ruby' });
    expect(state.currentPlayerIndex).toBe(2);
    state = act(state, 'p3', { type: 'TAKE_TWO', color: 'onyx' });
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.round).toBe(1);
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'emerald' });
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.round).toBe(2);
  });

  it('strips unknown fields from logged actions', () => {
    const state = act(newGame(2), 'p1', {
      type: 'TAKE_TWO',
      color: 'ruby',
      // @ts-expect-error extra field from an untrusted client
      cheat: true,
    });
    expect(state.log[0]!.action).toEqual({ type: 'TAKE_TWO', color: 'ruby' });
    expect(state.version).toBe(1);
    expect(state.log[0]!.seq).toBe(1);
  });
});
