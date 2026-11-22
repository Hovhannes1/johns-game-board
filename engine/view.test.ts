import { describe, expect, it } from 'vitest';
import {
  explainIntentForViewer,
  getLegalActions,
  getPublicView,
  legalIntentsForViewer,
} from './index';
import { act, newGame, setTokens } from './testing/helpers';
import { LEVELS } from './types';

describe('hidden information (FR-20, FR-21)', () => {
  it('shows blind reserves only to their owner', () => {
    let state = newGame(3);
    const blind = state.decks[2][0]!;
    state = act(state, 'p1', { type: 'RESERVE_FROM_DECK', level: 2 });

    const own = getPublicView(state, 'p1').players[0]!.reserved[0]!;
    expect(own).toMatchObject({ hidden: false, fromDeck: true, card: { id: blind } });

    for (const viewer of ['p2', 'p3', null]) {
      const view = getPublicView(state, viewer);
      expect(view.players[0]!.reserved[0]).toEqual({ hidden: true, fromDeck: true, level: 2 });
      expect(view.log[0]!.events[0]).toMatchObject({
        type: 'CARD_RESERVED',
        cardId: null,
        level: 2,
      });
      expect(JSON.stringify(view)).not.toContain(blind);
    }
    expect(getPublicView(state, 'p1').log[0]!.events[0]).toMatchObject({ cardId: blind });
  });

  it('shows face-up reserves to everyone', () => {
    let state = newGame(2);
    const cardId = state.market[1][0]!;
    state = act(state, 'p1', { type: 'RESERVE_FACE_UP', cardId });
    for (const viewer of ['p1', 'p2', null]) {
      const reserved = getPublicView(state, viewer).players[0]!.reserved[0]!;
      expect(reserved).toMatchObject({ hidden: false, fromDeck: false, card: { id: cardId } });
    }
  });

  it('never reveals deck order, only deck sizes', () => {
    const state = newGame(4);
    for (const viewer of ['p1', 'p4', null]) {
      const view = getPublicView(state, viewer);
      const json = JSON.stringify(view);
      for (const level of LEVELS) {
        expect(view.deckCounts[level]).toBe(state.decks[level].length);
        for (const id of state.decks[level]) expect(json).not.toContain(`"${id}"`);
      }
      expect(json).not.toContain(state.seed);
    }
  });

  it('includes everything a player needs to render the table', () => {
    let state = newGame(2);
    setTokens(state, 'p1', { ruby: 2 });
    state = act(state, 'p1', { type: 'TAKE_TWO', color: 'onyx' });
    const view = getPublicView(state, 'p2');
    expect(view).toMatchObject({
      viewerId: 'p2',
      version: 1,
      currentPlayerId: 'p2',
      startPlayerId: 'p1',
      status: 'playing',
      round: 1,
    });
    expect(view.players[0]).toMatchObject({ id: 'p1', seat: 0, tokenCount: 4, points: 0 });
    expect(view.market[3].every((c) => c !== null && c.level === 3)).toBe(true);
    expect(view.nobles).toHaveLength(3);
  });

  it('returns copies that cannot corrupt the game state', () => {
    const state = newGame(2);
    const view = getPublicView(state, 'p1');
    view.supply.ruby = 99;
    view.players[0]!.tokens.ruby = 99;
    view.market[1][0] = null;
    expect(state.supply.ruby).toBe(4);
    expect(state.players[0]!.tokens.ruby).toBe(0);
    expect(state.market[1][0]).not.toBeNull();
  });
});

describe('client-side rules on a view (FR-10)', () => {
  it('lists the same legal intents the server computes', () => {
    const state = newGame(3);
    const serverSide = getLegalActions(state, 'p1').map(({ playerId: _p, ...intent }) => intent);
    expect(legalIntentsForViewer(getPublicView(state, 'p1'))).toEqual(serverSide);
    expect(legalIntentsForViewer(getPublicView(state, 'p2'))).toEqual([]);
    expect(legalIntentsForViewer(getPublicView(state, null))).toEqual([]);
  });

  it('explains why an action is unavailable', () => {
    const state = newGame(2);
    const view = getPublicView(state, 'p1');
    expect(explainIntentForViewer(view, { type: 'TAKE_THREE', colors: ['ruby'] })?.message).toBe(
      'Take exactly 3 different colors.',
    );
    expect(explainIntentForViewer(view, { type: 'TAKE_TWO', color: 'ruby' })).toBeNull();
    expect(explainIntentForViewer(getPublicView(state, 'p2'), { type: 'PASS' })?.code).toBe(
      'NOT_YOUR_TURN',
    );
    expect(explainIntentForViewer(getPublicView(state, null), { type: 'PASS' })?.code).toBe(
      'UNKNOWN_PLAYER',
    );
  });

  it("can validate buying the viewer's own blind reserve", () => {
    let state = newGame(2);
    state = act(state, 'p1', { type: 'RESERVE_FROM_DECK', level: 1 });
    state = act(state, 'p2', { type: 'TAKE_TWO', color: 'ruby' });
    const cardId = state.players[0]!.reserved[0]!.cardId;
    const view = getPublicView(state, 'p1');
    const error = explainIntentForViewer(view, { type: 'BUY_RESERVED', cardId });
    expect(error === null || error.code === 'CANNOT_AFFORD').toBe(true);
  });
});
