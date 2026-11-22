import { describe, expect, it } from 'vitest';
import { getLegalActions, scoreboard } from './index';
import {
  act,
  cardsOf,
  expectRejected,
  givePurchased,
  giveReserved,
  newGame,
  player,
  setSupply,
} from './testing/helpers';
import { LEVELS } from './types';
import type { GameState } from './types';

const fivePointers = cardsOf((c) => c.level === 3 && c.points === 5).map((c) => c.id);
const threePointers = cardsOf((c) => c.level === 3 && c.points === 3).map((c) => c.id);
const fourPointers = cardsOf((c) => c.level === 3 && c.points === 4).map((c) => c.id);

describe('end of game (2.4)', () => {
  it('finishes the round after someone reaches 15, then ends', () => {
    let state = newGame(2);
    givePurchased(state, 'p1', fivePointers.slice(0, 3));
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' });
    expect(state.finalRound).toBe(true);
    expect(state.status).toBe('playing');
    expect(state.log.at(-1)!.events).toContainEqual({
      type: 'FINAL_ROUND',
      playerId: 'p1',
      points: 15,
    });

    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'onyx' });
    expect(state.status).toBe('finished');
    expect(state.players.map((p) => p.turnsTaken)).toEqual([1, 1]);
    expect(state.result).toMatchObject({
      reason: 'targetReached',
      winners: ['p1'],
      tieBreak: 'none',
    });
    expect(state.log.at(-1)!.events.at(-1)).toEqual({
      type: 'GAME_ENDED',
      reason: 'targetReached',
      winners: ['p1'],
    });
  });

  it('gives every player the same number of turns when a later seat triggers', () => {
    let state = newGame(3);
    givePurchased(state, 'p2', fivePointers.slice(0, 3));
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' });
    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'onyx' });
    expect(state.finalRound).toBe(true);
    state = act(state, 'p3', { type: 'TAKE_TWO', color: 'diamond' });
    expect(state.status).toBe('finished');
    expect(state.players.map((p) => p.turnsTaken)).toEqual([1, 1, 1]);
  });

  it('ends immediately when the last seat of the round triggers', () => {
    let state = newGame(2);
    givePurchased(state, 'p2', fivePointers.slice(0, 3));
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' });
    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'onyx' });
    expect(state.status).toBe('finished');
    expect(state.result?.winners).toEqual(['p2']);
  });

  it('the highest score wins, not the first to reach 15', () => {
    let state = newGame(2);
    givePurchased(state, 'p1', fivePointers.slice(0, 3));
    givePurchased(state, 'p2', [...fivePointers.slice(3, 5), ...fourPointers.slice(0, 2)]);
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' });
    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'onyx' });
    expect(scoreboard(state)).toEqual({ p1: 15, p2: 18 });
    expect(state.result?.winners).toEqual(['p2']);
    expect(state.result?.standings.map((s) => [s.playerId, s.rank])).toEqual([
      ['p2', 1],
      ['p1', 2],
    ]);
  });

  it('breaks ties by fewest purchased cards', () => {
    let state = newGame(2);
    givePurchased(state, 'p1', fivePointers.slice(0, 3)); // 15 points, 3 cards
    givePurchased(state, 'p2', threePointers.slice(0, 5)); // 15 points, 5 cards
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' });
    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'onyx' });
    expect(state.result).toMatchObject({ winners: ['p1'], tieBreak: 'fewestCards' });
  });

  it('shares the victory when points and card counts are tied', () => {
    let state = newGame(3);
    givePurchased(state, 'p1', [...fourPointers.slice(0, 3), threePointers[0]!]); // 15 points, 4 cards
    givePurchased(state, 'p3', [...fourPointers.slice(3, 6), threePointers[1]!]); // 15 points, 4 cards
    givePurchased(state, 'p2', [threePointers[2]!]);
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' });
    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'onyx' });
    state = act(state, 'p3', { type: 'TAKE_TWO', color: 'diamond' });
    expect(state.result).toMatchObject({ winners: ['p1', 'p3'], tieBreak: 'shared' });
    expect(state.result?.standings.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it('counts nobles toward the target', () => {
    let state = newGame(2);
    state.nobles = ['N09'];
    givePurchased(state, 'p1', [
      ...fivePointers.slice(0, 2),
      cardsOf((c) => c.level === 2 && c.points === 2 && c.bonus === 'diamond')[0]!.id,
      ...cardsOf((c) => c.level === 1 && c.bonus === 'emerald')
        .slice(0, 4)
        .map((c) => c.id),
      ...cardsOf((c) => c.level === 1 && c.bonus === 'ruby')
        .slice(0, 4)
        .map((c) => c.id),
    ]);
    expect(scoreboard(state).p1).toBe(12);
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'diamond' });
    expect(scoreboard(state).p1).toBe(15);
    expect(state.finalRound).toBe(true);
  });

  it('rejects every action once the game is over', () => {
    let state = newGame(2);
    givePurchased(state, 'p2', fivePointers.slice(0, 3));
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' });
    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'onyx' });
    expect(state.status).toBe('finished');
    expectRejected(state, 'p1', { type: 'TAKE_TWO', color: 'ruby' }, 'GAME_FINISHED');
    expect(getLegalActions(state, 'p1')).toEqual([]);
  });
});

describe('pass (2.5)', () => {
  /** No tokens to take, nothing affordable, reserve full, no cards to reserve. */
  function deadlock(state: GameState): GameState {
    setSupply(state, {});
    const expensive = cardsOf(
      (c) => c.level === 3 && (c.cost.diamond >= 7 || c.cost.sapphire >= 7 || c.cost.onyx >= 7),
    ).map((c) => c.id);
    giveReserved(state, 'p1', expensive.slice(0, 3));
    giveReserved(state, 'p2', expensive.slice(3, 6));
    for (const level of LEVELS) {
      state.market[level] = state.market[level].map(() => null);
      state.decks[level] = [];
    }
    return state;
  }

  it('is not allowed while any other action is possible', () => {
    expectRejected(newGame(2), 'p1', { type: 'PASS' }, 'PASS_NOT_ALLOWED');
    expect(getLegalActions(newGame(2), 'p1').some((a) => a.type === 'PASS')).toBe(false);
  });

  it('is the only legal action when nothing else is possible', () => {
    const state = deadlock(newGame(2));
    expect(getLegalActions(state, 'p1')).toEqual([{ type: 'PASS', playerId: 'p1' }]);
    const next = act(state, 'p1', { type: 'PASS' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.log[0]!.events).toEqual([{ type: 'PASSED', playerId: 'p1' }]);
  });

  it('ends the game when every player passes in a row', () => {
    let state = deadlock(newGame(2));
    state = act(state, 'p1', { type: 'PASS' });
    expect(state.status).toBe('playing');
    state = act(state, 'p2', { type: 'PASS' });
    expect(state.status).toBe('finished');
    expect(state.result?.reason).toBe('stalemate');
  });

  it('a noble visit during a pass turn restarts the stalemate count', () => {
    let state = deadlock(newGame(2));
    state.nobles = ['N09'];
    // Bonuses in emerald/ruby cannot discount the reserved diamond/sapphire/onyx cards enough.
    player(state, 'p1').purchased = [
      ...cardsOf((c) => c.level === 1 && c.bonus === 'emerald')
        .slice(0, 4)
        .map((c) => c.id),
      ...cardsOf((c) => c.level === 1 && c.bonus === 'ruby')
        .slice(0, 4)
        .map((c) => c.id),
    ];
    state = act(state, 'p1', { type: 'PASS' });
    expect(player(state, 'p1').nobles).toEqual(['N09']);
    // Without the reset, p1's noble pass plus this one would already end the game.
    state = act(state, 'p2', { type: 'PASS' });
    expect(state.status).toBe('playing');
    // A full round of passes since the visit: nobody can act any more.
    state = act(state, 'p1', { type: 'PASS' });
    expect(state.status).toBe('finished');
    expect(state.result?.reason).toBe('stalemate');
  });
});
