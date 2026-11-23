import { describe, expect, it } from 'vitest';
import { createRng } from '@/platform/engine/rng';
import {
  CARD_IDS,
  actionsFromLog,
  applyAction,
  canKontra,
  canRekontra,
  cardPoints,
  createGame,
  getPublicView,
  isValidBid,
  legalCards,
  replayGame,
} from './index';
import type { ActionIntent, GameState, Strain } from './index';

const TOTAL_GAMES = Number(process.env.FUZZ_GAMES ?? 200);
const MAX_ACTIONS = 2000;
const SEATS = [
  { id: 'p0', name: 'Anna' },
  { id: 'p1', name: 'Ben' },
  { id: 'p2', name: 'Cleo' },
  { id: 'p3', name: 'Dan' },
];
const STRAINS: Strain[] = ['S', 'H', 'D', 'C', 'BOY'];

function seedFor(n: number): string {
  return n.toString(16).padStart(8, '0').repeat(8);
}

function randomIntent(state: GameState, rng: ReturnType<typeof createRng>): ActionIntent {
  const seat = state.currentSeat;
  if (state.phase === 'bidding') {
    const roll = rng.nextInt(10);
    if (roll === 0 && canKontra(state, seat)) {
      return { type: 'KONTRA' };
    }
    if (roll <= 3) {
      const minVal = state.bidding.high ? state.bidding.high.bid.value + 1 : 8;
      if (minVal <= 14) {
        const value = minVal + rng.nextInt(Math.min(3, 15 - minVal));
        const strain = STRAINS[rng.nextInt(STRAINS.length)]!;
        const kaput = Boolean(state.bidding.high?.bid.kaput);
        if (isValidBid(state.bidding.high, { value, strain, kaput })) {
          return { type: 'BID', value, strain, kaput };
        }
      }
    }
    return { type: 'PASS' };
  }
  if (state.phase === 'kontra') {
    if (canRekontra(state, seat) && rng.nextInt(4) === 0) {
      return { type: 'REKONTRA' };
    }
    return { type: 'PASS' };
  }
  const legal = legalCards(state.hands[seat]!, state.trick.plays, state.contract!.strain, seat);
  return { type: 'PLAY', card: legal[rng.nextInt(legal.length)]! };
}

function checkInvariants(state: GameState) {
  // 32 distinct cards conserved when in playing phase or bidding phase
  if (state.status === 'playing') {
    const cardsInHands = state.hands.flat();
    const cardsInTrick = state.trick.plays.map((p) => p.card);
    const totalCards =
      cardsInHands.length +
      cardsInTrick.length +
      (state.captured.tricks[0] + state.captured.tricks[1]) * 4;
    expect(totalCards).toBe(32);
    expect(new Set([...cardsInHands, ...cardsInTrick]).size).toBe(
      cardsInHands.length + cardsInTrick.length,
    );
  }
  if (state.phase === 'playing' && state.contract) {
    // Total deck points + 10 last trick = 162
    const remainingPts =
      state.hands.flat().reduce((s, c) => s + cardPoints(c, state.contract!.strain), 0) +
      state.trick.plays.reduce((s, p) => s + cardPoints(p.card, state.contract!.strain), 0);
    const capturedPts = state.captured.points[0] + state.captured.points[1];
    const isFinishedRound = state.status === 'finished';
    expect(remainingPts + capturedPts + (isFinishedRound ? 0 : 10)).toBe(162);
  }
}

describe('bazar-blot fuzz', () => {
  it(
    `plays ${TOTAL_GAMES} complete random matches without invariant failures`,
    () => {
      for (let g = 0; g < TOTAL_GAMES; g++) {
        const seed = seedFor(g + 1);
        const rng = createRng(seed, [99, 0, 0]);
        let state = createGame({ players: SEATS, options: { targetScore: 101 } }, seed);
        let steps = 0;

        while (state.status === 'playing' && steps < MAX_ACTIONS) {
          const playerId = state.players[state.currentSeat]!.id;
          const intent = randomIntent(state, rng);
          const res = applyAction(state, { ...intent, playerId });
          expect(res.ok).toBe(true);
          if (!res.ok) break;
          state = res.state;
          steps += 1;
          checkInvariants(state);
        }

        expect(state.status).toBe('finished');
        expect(state.result).not.toBeNull();
        expect(CARD_IDS).toHaveLength(32);

        // Spot-check view redaction and replay on every 20th game
        if (g % 20 === 0) {
          const view = getPublicView(state, 'p0');
          expect(JSON.stringify(view)).not.toContain(seed);
          const replayed = replayGame(
            { players: SEATS, options: { targetScore: 101 } },
            seed,
            actionsFromLog(state),
          );
          expect(replayed).toEqual(state);
        }
      }
    },
    Math.max(60_000, TOTAL_GAMES * 100),
  );
});
