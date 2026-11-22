import { describe, expect, it } from 'vitest';
import { toGemCounts } from '@/engine';
import type { GameEvent } from '@/engine';
import { catalogFor } from './catalog';
import { cardTitle, describeCard, formatEvent, formatLog, tokenList } from './format';

const catalog = catalogFor('base');
const ctx = { catalog, playerName: (id: string) => ({ p1: 'Anna', p2: 'Ben' })[id] ?? id };

describe('formatting', () => {
  it('lists tokens in gem order', () => {
    expect(tokenList({ gold: 1, diamond: 2 })).toBe('2 diamond and 1 gold');
    expect(tokenList({ ruby: 1, onyx: 1, diamond: 1 })).toBe('1 diamond, 1 ruby and 1 onyx');
    expect(tokenList({})).toBe('');
  });

  it('names and describes cards', () => {
    const card = catalog.card('L2-emerald-01')!;
    expect(cardTitle(card)).toBe('Level II emerald card');
    expect(describeCard({ ...card, points: 2, cost: toGemCounts({ diamond: 4, onyx: 1 }) })).toBe(
      'Level II emerald card, 2 prestige, costs 4 diamond and 1 onyx',
    );
  });

  it('formats purchases like the spec example', () => {
    const event: GameEvent = {
      type: 'CARD_PURCHASED',
      playerId: 'p1',
      cardId: 'L2-emerald-01',
      fromReserve: false,
      payment: { diamond: 2, gold: 1 },
    };
    expect(formatEvent(event, ctx)).toBe(
      'Anna bought a Level II emerald card for 2 diamond and 1 gold.',
    );
  });

  it('keeps blind reserves vague when the card is hidden', () => {
    const hidden: GameEvent = {
      type: 'CARD_RESERVED',
      playerId: 'p2',
      cardId: null,
      level: 3,
      fromDeck: true,
      gold: 1,
    };
    expect(formatEvent(hidden, ctx)).toBe(
      'Ben reserved a Level III card from the deck and took 1 gold.',
    );
    const own: GameEvent = { ...hidden, cardId: 'L3-ruby-02', gold: 0 };
    expect(formatEvent(own, ctx)).toBe(
      'Ben reserved a Level III ruby card from the deck. No gold was left.',
    );
  });

  it('formats the other events and skips card deals', () => {
    expect(formatEvent({ type: 'NOBLE_VISITED', playerId: 'p1', nobleId: 'N01' }, ctx)).toBe(
      'The Doge of Venice visited Anna (+3 prestige).',
    );
    expect(
      formatEvent({ type: 'GAME_ENDED', reason: 'targetReached', winners: ['p1', 'p2'] }, ctx),
    ).toBe('Game over: Anna and Ben share the victory.');
    expect(
      formatEvent({ type: 'CARD_DEALT', level: 1, slot: 0, cardId: 'L1-ruby-01' }, ctx),
    ).toBeNull();
    const lines = formatLog(
      [
        {
          seq: 1,
          playerId: 'p1',
          action: { type: 'TAKE_TWO', color: 'ruby' },
          events: [{ type: 'TOKENS_TAKEN', playerId: 'p1', tokens: { ruby: 2 } }],
        },
      ],
      ctx,
    );
    expect(lines).toEqual([{ key: '1-0', seq: 1, text: 'Anna took 2 ruby.' }]);
  });
});
