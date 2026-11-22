import { describe, expect, it } from 'vitest';
import { basePack } from '../data';
import { createGame, GEM_COLORS, getPublicView } from './index';
import { allCardIds, newGame, SEED, seats } from './testing/helpers';

describe('setup (2.2)', () => {
  const expectations = [
    { players: 2, gems: 4, nobles: 3 },
    { players: 3, gems: 5, nobles: 4 },
    { players: 4, gems: 7, nobles: 5 },
  ];

  for (const { players, gems, nobles } of expectations) {
    it(`sets up a ${players}-player game`, () => {
      const state = newGame(players);
      for (const color of GEM_COLORS) expect(state.supply[color]).toBe(gems);
      expect(state.supply.gold).toBe(5);
      expect(state.nobles).toHaveLength(nobles);
      expect(new Set(state.nobles).size).toBe(nobles);
      for (const level of [1, 2, 3] as const) {
        expect(state.market[level]).toHaveLength(4);
        expect(state.market[level].every((id) => id !== null)).toBe(true);
      }
      expect(state.decks[1]).toHaveLength(36);
      expect(state.decks[2]).toHaveLength(26);
      expect(state.decks[3]).toHaveLength(16);
      expect(state.players).toHaveLength(players);
      for (const p of state.players) {
        expect(Object.values(p.tokens).every((n) => n === 0)).toBe(true);
        expect(p.purchased).toEqual([]);
        expect(p.reserved).toEqual([]);
        expect(p.nobles).toEqual([]);
      }
      expect(state).toMatchObject({
        round: 1,
        phase: { kind: 'action' },
        status: 'playing',
        version: 0,
        log: [],
        finalRound: false,
        result: null,
      });
    });
  }

  it('deals each level from its own deck and accounts for all 90 cards', () => {
    const state = newGame(4);
    for (const level of [1, 2, 3] as const) {
      const ids = [...state.decks[level], ...state.market[level]];
      expect(ids.every((id) => state.catalog.cards[id!]!.level === level)).toBe(true);
    }
    expect(allCardIds(state).sort()).toEqual(basePack.cards.map((c) => c.id).sort());
  });

  it('is deterministic for a seed', () => {
    expect(newGame(3, SEED)).toEqual(newGame(3, SEED));
    const other = newGame(3, 'ff'.repeat(32));
    expect(other.decks[1]).not.toEqual(newGame(3, SEED).decks[1]);
  });

  it('uses the requested starting player', () => {
    const state = newGame(3, SEED, 2);
    expect(state.startPlayerIndex).toBe(2);
    expect(state.currentPlayerIndex).toBe(2);
  });

  it('picks a random starting player from the seed when none is given', () => {
    const starts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const seed = i.toString(16).padStart(2, '0').repeat(32);
      const state = createGame({ players: seats(4), pack: basePack }, seed);
      expect(state.startPlayerIndex).toBeGreaterThanOrEqual(0);
      expect(state.startPlayerIndex).toBeLessThan(4);
      expect(state.currentPlayerIndex).toBe(state.startPlayerIndex);
      starts.add(state.startPlayerIndex);
    }
    expect(starts.size).toBeGreaterThan(1);
  });

  it('rejects invalid configurations', () => {
    const pack = basePack;
    expect(() => createGame({ players: seats(1), pack }, SEED)).toThrow(/2 to 4/);
    expect(() => createGame({ players: seats(5), pack }, SEED)).toThrow(/2 to 4/);
    expect(() =>
      createGame(
        {
          players: [
            { id: 'a', name: 'A' },
            { id: 'a', name: 'B' },
          ],
          pack,
        },
        SEED,
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      createGame(
        {
          players: [
            { id: '', name: 'A' },
            { id: 'b', name: 'B' },
          ],
          pack,
        },
        SEED,
      ),
    ).toThrow(/empty/);
    expect(() => createGame({ players: seats(2), pack, startingPlayerIndex: 2 }, SEED)).toThrow();
    expect(() => createGame({ players: seats(2), pack }, 'short')).toThrow(/Seed/);
    expect(() =>
      createGame({ players: seats(2), pack, rules: { noblesByPlayers: { 2: undefined! } } }, SEED),
    ).toThrow(/no setup/);
  });

  it('rejects packs with duplicate ids', () => {
    const dupCards = { ...basePack, cards: [...basePack.cards, basePack.cards[0]!] };
    expect(() => createGame({ players: seats(2), pack: dupCards }, SEED)).toThrow(/Duplicate card/);
    const dupNobles = { ...basePack, nobles: [...basePack.nobles, basePack.nobles[0]!] };
    expect(() => createGame({ players: seats(2), pack: dupNobles }, SEED)).toThrow(
      /Duplicate noble/,
    );
  });

  it('supports house-rule overrides', () => {
    const state = createGame(
      {
        players: seats(2),
        pack: basePack,
        rules: { targetPoints: 21, gemTokensByPlayers: { 2: 6 } },
      },
      SEED,
    );
    expect(state.rules.targetPoints).toBe(21);
    expect(state.supply.ruby).toBe(6);
    expect(state.rules.noblesByPlayers[4]).toBe(5);
  });

  it('never exposes the seed in a view', () => {
    const state = newGame(2);
    expect(JSON.stringify(getPublicView(state, 'p1'))).not.toContain(SEED);
  });
});
