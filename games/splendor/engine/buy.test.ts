import { describe, expect, it } from 'vitest';
import { computePayment, emptyGems, emptyTokens, toGemCounts, toTokenCounts } from './index';
import {
  act,
  card,
  emptyDeck,
  expectRejected,
  givePurchased,
  giveReserved,
  newGame,
  placeInMarket,
  player,
  setTokens,
} from './testing/helpers';

// L1-diamond-01: 0 points, costs 3 sapphire.
// L1-diamond-08: 1 point, costs 4 emerald.
const THREE_SAPPHIRE = 'L1-diamond-01';
const FOUR_EMERALD = 'L1-diamond-08';

describe('computePayment (2.4, 2.5)', () => {
  it('uses bonuses, then gems, then gold for the shortfall', () => {
    const cost = toGemCounts({ ruby: 3, onyx: 2 });
    const plan = computePayment(
      cost,
      toGemCounts({ ruby: 1 }),
      toTokenCounts({ ruby: 1, onyx: 5, gold: 2 }),
    );
    expect(plan).toEqual({
      affordable: true,
      missing: 0,
      payment: toTokenCounts({ ruby: 1, onyx: 2, gold: 1 }),
    });
  });

  it('a fully discounted card costs nothing', () => {
    const plan = computePayment(toGemCounts({ ruby: 2 }), toGemCounts({ ruby: 3 }), emptyTokens());
    expect(plan).toEqual({ affordable: true, missing: 0, payment: emptyTokens() });
  });

  it('reports how much is missing', () => {
    const plan = computePayment(
      toGemCounts({ diamond: 7 }),
      emptyGems(),
      toTokenCounts({ diamond: 3, gold: 1 }),
    );
    expect(plan.affordable).toBe(false);
    expect(plan.missing).toBe(3);
  });
});

describe('buy a card (2.3 action 4, 2.4)', () => {
  it('buys a face-up card, returns paid tokens to the supply and refills the slot', () => {
    const state = newGame(2);
    placeInMarket(state, THREE_SAPPHIRE, 2);
    setTokens(state, 'p1', { sapphire: 3, ruby: 1 });
    const top = state.decks[1][0]!;
    const supplyBefore = state.supply.sapphire;
    const next = act(state, 'p1', { type: 'BUY_FACE_UP', cardId: THREE_SAPPHIRE });
    const p1 = player(next, 'p1');
    expect(p1.purchased).toEqual([THREE_SAPPHIRE]);
    expect(p1.tokens).toMatchObject({ sapphire: 0, ruby: 1 });
    expect(next.supply.sapphire).toBe(supplyBefore + 3);
    expect(next.market[1][2]).toBe(top);
    expect(next.log[0]!.events).toEqual([
      {
        type: 'CARD_PURCHASED',
        playerId: 'p1',
        cardId: THREE_SAPPHIRE,
        fromReserve: false,
        payment: { sapphire: 3 },
      },
      { type: 'CARD_DEALT', level: 1, slot: 2, cardId: top },
    ]);
  });

  it('applies bonuses as permanent discounts and allows zero-token purchases', () => {
    const state = newGame(2);
    const sapphireBonuses = ['L1-sapphire-01', 'L1-sapphire-02', 'L1-sapphire-03'];
    givePurchased(state, 'p1', sapphireBonuses);
    placeInMarket(state, THREE_SAPPHIRE, 0);
    const next = act(state, 'p1', { type: 'BUY_FACE_UP', cardId: THREE_SAPPHIRE });
    expect(player(next, 'p1').purchased).toContain(THREE_SAPPHIRE);
    expect(next.log[0]!.events[0]).toMatchObject({ type: 'CARD_PURCHASED', payment: {} });
  });

  it('spends gold only for what gems cannot cover', () => {
    const state = newGame(2);
    placeInMarket(state, FOUR_EMERALD, 0);
    setTokens(state, 'p1', { emerald: 2, gold: 3 });
    const next = act(state, 'p1', { type: 'BUY_FACE_UP', cardId: FOUR_EMERALD });
    expect(player(next, 'p1').tokens).toMatchObject({ emerald: 0, gold: 1 });
    expect(next.supply.gold).toBe(4);
  });

  it('rejects purchases the player cannot afford', () => {
    const state = newGame(2);
    placeInMarket(state, FOUR_EMERALD, 0);
    setTokens(state, 'p1', { emerald: 2, gold: 1 });
    expectRejected(state, 'p1', { type: 'BUY_FACE_UP', cardId: FOUR_EMERALD }, 'CANNOT_AFFORD');
  });

  it('buys a reserved card, including a blind reserve', () => {
    const state = newGame(2);
    giveReserved(state, 'p1', [FOUR_EMERALD], true);
    setTokens(state, 'p1', { emerald: 4 });
    const next = act(state, 'p1', { type: 'BUY_RESERVED', cardId: FOUR_EMERALD });
    expect(player(next, 'p1').reserved).toEqual([]);
    expect(player(next, 'p1').purchased).toEqual([FOUR_EMERALD]);
    expect(next.log[0]!.events[0]).toMatchObject({ fromReserve: true });
    expect(next.market).toEqual(state.market);
  });

  it("cannot buy another player's reserved card or a reserved card via the market", () => {
    const state = newGame(2);
    giveReserved(state, 'p2', [FOUR_EMERALD]);
    setTokens(state, 'p1', { emerald: 4 });
    expectRejected(
      state,
      'p1',
      { type: 'BUY_RESERVED', cardId: FOUR_EMERALD },
      'CARD_NOT_RESERVED',
    );
    expectRejected(
      state,
      'p1',
      { type: 'BUY_FACE_UP', cardId: FOUR_EMERALD },
      'CARD_NOT_IN_MARKET',
    );
  });

  it('leaves the slot empty when the deck is exhausted', () => {
    const state = newGame(2);
    placeInMarket(state, THREE_SAPPHIRE, 1);
    emptyDeck(state, 1);
    setTokens(state, 'p1', { sapphire: 3 });
    const next = act(state, 'p1', { type: 'BUY_FACE_UP', cardId: THREE_SAPPHIRE });
    expect(next.market[1][1]).toBeNull();
  });

  it('rejects malformed card ids', () => {
    const state = newGame(2);
    // @ts-expect-error cardId must be a string
    expectRejected(state, 'p1', { type: 'BUY_FACE_UP', cardId: null }, 'MALFORMED_ACTION');
    // @ts-expect-error cardId must be a string
    expectRejected(state, 'p1', { type: 'BUY_RESERVED', cardId: 1 }, 'MALFORMED_ACTION');
  });

  it('card data used by these tests is what we expect', () => {
    expect(card(THREE_SAPPHIRE)).toMatchObject({ points: 0, cost: { sapphire: 3 } });
    expect(card(FOUR_EMERALD)).toMatchObject({ points: 1, cost: { emerald: 4 } });
  });
});
