import { describe, expect, it } from 'vitest';
import { getLegalActions } from './index';
import {
  act,
  emptyDeck,
  expectRejected,
  giveReserved,
  newGame,
  player,
  setSupply,
} from './testing/helpers';

describe('reserve a card (2.3 action 3, 2.4)', () => {
  it('reserves a face-up card, takes a gold, and refills the slot from the same deck', () => {
    const state = newGame(2);
    const cardId = state.market[2][1]!;
    const topOfDeck = state.decks[2][0]!;
    const next = act(state, 'p1', { type: 'RESERVE_FACE_UP', cardId });
    const p1 = player(next, 'p1');
    expect(p1.reserved).toEqual([{ cardId, fromDeck: false }]);
    expect(p1.tokens.gold).toBe(1);
    expect(next.supply.gold).toBe(4);
    expect(next.market[2][1]).toBe(topOfDeck);
    expect(next.decks[2]).toHaveLength(state.decks[2].length - 1);
    expect(next.log[0]!.events).toEqual([
      { type: 'CARD_RESERVED', playerId: 'p1', cardId, level: 2, fromDeck: false, gold: 1 },
      { type: 'CARD_DEALT', level: 2, slot: 1, cardId: topOfDeck },
    ]);
  });

  it('reserves blind from the top of a deck', () => {
    const state = newGame(2);
    const top = state.decks[3][0]!;
    const next = act(state, 'p1', { type: 'RESERVE_FROM_DECK', level: 3 });
    expect(player(next, 'p1').reserved).toEqual([{ cardId: top, fromDeck: true }]);
    expect(next.decks[3]).toHaveLength(state.decks[3].length - 1);
    expect(next.market[3]).toEqual(state.market[3]);
  });

  it('still allows reserving without gold when the gold supply is empty', () => {
    const state = newGame(2);
    setSupply(state, { ...state.supply, gold: 0 });
    const next = act(state, 'p1', { type: 'RESERVE_FROM_DECK', level: 1 });
    expect(player(next, 'p1').reserved).toHaveLength(1);
    expect(player(next, 'p1').tokens.gold).toBe(0);
    expect(next.log[0]!.events[0]).toMatchObject({ type: 'CARD_RESERVED', gold: 0 });
  });

  it('allows at most 3 reserved cards', () => {
    const state = newGame(2);
    giveReserved(state, 'p1', [state.decks[1][0]!, state.decks[1][1]!, state.decks[2][0]!]);
    expectRejected(
      state,
      'p1',
      { type: 'RESERVE_FACE_UP', cardId: state.market[1][0]! },
      'RESERVE_LIMIT',
    );
    expectRejected(state, 'p1', { type: 'RESERVE_FROM_DECK', level: 1 }, 'RESERVE_LIMIT');
    expect(getLegalActions(state, 'p1').some((a) => a.type.startsWith('RESERVE'))).toBe(false);
  });

  it('cannot reserve from an empty deck', () => {
    const state = newGame(2);
    emptyDeck(state, 3);
    expectRejected(state, 'p1', { type: 'RESERVE_FROM_DECK', level: 3 }, 'DECK_EMPTY');
  });

  it('leaves the slot empty when the deck is exhausted', () => {
    const state = newGame(2);
    emptyDeck(state, 1);
    const cardId = state.market[1][3]!;
    const next = act(state, 'p1', { type: 'RESERVE_FACE_UP', cardId });
    expect(next.market[1][3]).toBeNull();
    expect(next.log[0]!.events.some((e) => e.type === 'CARD_DEALT')).toBe(false);
    expect(getLegalActions(next, 'p2').some((a) => 'cardId' in a && a.cardId === cardId)).toBe(
      false,
    );
  });

  it('rejects cards that are not face up and malformed levels', () => {
    const state = newGame(2);
    expectRejected(
      state,
      'p1',
      { type: 'RESERVE_FACE_UP', cardId: state.decks[1][0]! },
      'CARD_NOT_IN_MARKET',
    );
    expectRejected(state, 'p1', { type: 'RESERVE_FACE_UP', cardId: 'nope' }, 'CARD_NOT_IN_MARKET');
    // @ts-expect-error level 4 does not exist
    expectRejected(state, 'p1', { type: 'RESERVE_FROM_DECK', level: 4 }, 'MALFORMED_ACTION');
    // @ts-expect-error cardId must be a string
    expectRejected(state, 'p1', { type: 'RESERVE_FACE_UP', cardId: 7 }, 'MALFORMED_ACTION');
  });
});
