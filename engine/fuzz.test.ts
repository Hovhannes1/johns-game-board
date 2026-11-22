/**
 * Random-play fuzzing (section 8): thousands of complete games with random
 * legal moves, checking rule invariants after every action.
 * Set FUZZ_GAMES to run more (or fewer) games.
 */
import { describe, expect, it } from 'vitest';
import { basePack } from '../data';
import {
  applyAction,
  createGame,
  createRng,
  getLegalActions,
  getPublicView,
  pointsOf,
  sumCounts,
  TOKEN_COLORS,
} from './index';
import type { GameState, Rng } from './index';
import { allCardIds, seats } from './testing/helpers';
import { randomAction } from './testing/random-play';
import { LEVELS } from './types';

// 1,000 games locally keeps `npm test` quick; CI runs 5,000.
const TOTAL_GAMES = Number(process.env.FUZZ_GAMES ?? 1000);
const MAX_ACTIONS = 5000;
const ALL_CARD_IDS = basePack.cards.map((c) => c.id).sort();

function seedFor(n: number): string {
  return n.toString(16).padStart(8, '0').repeat(8);
}

function checkInvariants(
  state: GameState,
  initialSupply: GameState['supply'],
  initialNobles: string[],
) {
  // Tokens are conserved and never negative.
  for (const color of TOKEN_COLORS) {
    const held = state.players.reduce((sum, p) => sum + p.tokens[color], 0);
    expect(state.supply[color] + held).toBe(initialSupply[color]);
    expect(state.supply[color]).toBeGreaterThanOrEqual(0);
    for (const p of state.players) expect(p.tokens[color]).toBeGreaterThanOrEqual(0);
  }
  // Every card is in exactly one place.
  expect(allCardIds(state).sort()).toEqual(ALL_CARD_IDS);
  // Nobles are conserved.
  const nobles = [...state.nobles, ...state.players.flatMap((p) => p.nobles)].sort();
  expect(nobles).toEqual([...initialNobles].sort());

  for (const p of state.players) {
    expect(p.reserved.length).toBeLessThanOrEqual(state.rules.maxReserved);
    if (state.phase.kind === 'action') {
      expect(sumCounts(p.tokens)).toBeLessThanOrEqual(state.rules.maxTokens);
    }
  }
  if (state.phase.kind === 'returnTokens') {
    const current = state.players[state.currentPlayerIndex]!;
    expect(sumCounts(current.tokens) - state.phase.count).toBe(state.rules.maxTokens);
  }
  for (const level of LEVELS) {
    // A slot is only empty once its deck has run out.
    if (state.market[level].some((id) => id === null)) expect(state.decks[level]).toHaveLength(0);
  }

  if (state.status === 'playing') {
    const current = state.players[state.currentPlayerIndex]!;
    expect(getLegalActions(state, current.id).length).toBeGreaterThan(0);
    for (const p of state.players) {
      if (p.id !== current.id) expect(getLegalActions(state, p.id)).toEqual([]);
    }
  }
}

function checkViews(state: GameState) {
  const hidden = LEVELS.flatMap((level) => state.decks[level]);
  for (const viewer of [...state.players.map((p) => p.id), null]) {
    const json = JSON.stringify(getPublicView(state, viewer));
    const secret = [
      ...hidden,
      ...state.players
        .filter((p) => p.id !== viewer)
        .flatMap((p) => p.reserved.filter((r) => r.fromDeck).map((r) => r.cardId)),
    ];
    for (const id of secret) expect(json.includes(`"${id}"`)).toBe(false);
    expect(json.includes(state.seed)).toBe(false);
  }
}

function tryGarbage(state: GameState, rng: Rng) {
  const current = state.players[state.currentPlayerIndex]!;
  const garbage = [
    { type: 'TAKE_TWO', color: 'gold', playerId: current.id },
    { type: 'TAKE_THREE', colors: ['ruby', 'ruby', 'onyx'], playerId: current.id },
    { type: 'BUY_FACE_UP', cardId: 'nope', playerId: current.id },
    { type: 'RETURN_TOKENS', tokens: { ruby: -5 }, playerId: current.id },
    { type: 'TAKE_TWO', color: 'ruby', playerId: 'intruder' },
  ];
  const attempt = garbage[rng.nextInt(garbage.length)]!;
  const result = applyAction(state, attempt as never);
  expect(result.ok).toBe(false);
}

function runGames(playerCount: number, games: number, offset: number) {
  const outcomes = { targetReached: 0, stalemate: 0, actions: 0 };
  for (let g = 0; g < games; g++) {
    const seed = seedFor(offset + g);
    const rng = createRng(seedFor(0xfffff - offset - g));
    let state = createGame({ players: seats(playerCount), pack: basePack }, seed);
    const initialSupply = { ...state.supply };
    const initialNobles = [...state.nobles];
    // Mostly purchase-biased play, with some fully uniform games to reach odd corners.
    const buyBias = g % 5 === 0 ? 0 : 0.6;
    const deepCheck = g % 50 === 0;

    for (let i = 0; i < MAX_ACTIONS && state.status === 'playing'; i++) {
      const result = applyAction(state, randomAction(state, rng, buyBias));
      expect(result.ok).toBe(true);
      if (!result.ok) return outcomes;
      state = result.state;
      if (deepCheck) {
        checkInvariants(state, initialSupply, initialNobles);
        checkViews(state);
        tryGarbage(state, rng);
      }
    }

    checkInvariants(state, initialSupply, initialNobles);
    expect(state.status).toBe('finished');
    const result = state.result!;
    outcomes[result.reason] += 1;
    outcomes.actions += state.version;

    // Result consistency.
    const scores = state.players.map((p) => pointsOf(state.catalog, p));
    const best = Math.max(...scores);
    for (const winner of result.winners) {
      expect(
        pointsOf(
          state.catalog,
          state.players.find((p) => p.id === winner)!,
        ),
      ).toBe(best);
    }
    if (result.reason === 'targetReached') {
      expect(best).toBeGreaterThanOrEqual(state.rules.targetPoints);
      const turns = new Set(state.players.map((p) => p.turnsTaken));
      expect(turns.size).toBe(1);
    }
  }
  return outcomes;
}

describe('random-play fuzzing', () => {
  const perCount = Math.ceil(TOTAL_GAMES / 3);
  for (const [index, playerCount] of [2, 3, 4].entries()) {
    it(
      `plays ${perCount} random ${playerCount}-player games to completion`,
      { timeout: 600_000 },
      () => {
        const outcomes = runGames(playerCount, perCount, index * 100_000);
        expect(outcomes.targetReached + outcomes.stalemate).toBe(perCount);
        console.log(
          `${playerCount}p: ${outcomes.targetReached} finished by score, ${outcomes.stalemate} stalemates, ` +
            `avg ${(outcomes.actions / perCount).toFixed(0)} actions/game`,
        );
      },
    );
  }
});
