import { describe, expect, it } from 'vitest';
import { applyAction, autoIntent, createRng, validateAction } from './index';
import type { GameState } from './index';
import { act, giveReserved, newGame, setSupply, setTokens } from './testing/helpers';
import { randomAction } from './testing/random-play';

describe('autoIntent (timeouts and auto-skip)', () => {
  it('takes three gems from the fullest piles', () => {
    const state = newGame(2);
    setTokens(state, 'p2', { ruby: 2, onyx: 1 });
    expect(autoIntent(state, 'p1')).toEqual({
      type: 'TAKE_THREE',
      colors: ['diamond', 'sapphire', 'emerald'],
    });
  });

  it('returns the most-held gems first and keeps gold', () => {
    let state = newGame(2);
    setTokens(state, 'p1', { diamond: 4, sapphire: 3, gold: 3 });
    state = act(state, 'p1', { type: 'TAKE_THREE', colors: ['emerald', 'ruby', 'onyx'] });
    expect(state.phase).toEqual({ kind: 'returnTokens', count: 3 });
    expect(autoIntent(state, 'p1')).toEqual({
      type: 'RETURN_TOKENS',
      tokens: { diamond: 2, sapphire: 1 },
    });
  });

  it('chooses the first noble and reserves blind when no gems are left', () => {
    const state = newGame(2);
    setSupply(state, { gold: 5 });
    expect(autoIntent(state, 'p1')).toEqual({ type: 'RESERVE_FROM_DECK', level: 1 });
  });

  it('passes when nothing else is possible, and is null for other players', () => {
    const state = newGame(2);
    setSupply(state, {});
    giveReserved(state, 'p1', [state.decks[3][0]!, state.decks[3][1]!, state.decks[3][2]!]);
    for (const level of [1, 2, 3] as const) {
      state.market[level] = state.market[level].map(() => null);
      state.decks[level] = [];
    }
    expect(autoIntent(state, 'p1')).toEqual({ type: 'PASS' });
    expect(autoIntent(state, 'p2')).toBeNull();
  });

  it('always produces a legal move and can finish whole games', () => {
    for (let g = 0; g < 40; g++) {
      const rng = createRng(g.toString(16).padStart(2, '0').repeat(32));
      let state: GameState = newGame(2 + (g % 3), g.toString(16).padStart(2, '0').repeat(32));
      for (let i = 0; i < 3000 && state.status === 'playing'; i++) {
        const current = state.players[state.currentPlayerIndex]!.id;
        // Mix auto moves with random play so auto meets varied positions.
        const auto = i % 2 === 0 ? autoIntent(state, current) : null;
        const action = auto ? { ...auto, playerId: current } : randomAction(state, rng, 0.6);
        expect(validateAction(state, action)).toBeNull();
        const result = applyAction(state, action);
        if (!result.ok) throw new Error(result.error.message);
        state = result.state;
      }
      expect(state.status).toBe('finished');
    }
  });
});
