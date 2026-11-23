import { createRng, isValidSeed, shuffle } from '@/platform/engine/rng';
import { CARD_IDS } from './cards';
import type { CardId } from './cards';
import type { GameConfig, GameState, TargetScore } from './types';
import { TARGET_SCORES, nextSeat } from './types';

function resolveTargetScore(raw: unknown): TargetScore {
  if (typeof raw === 'number' && (TARGET_SCORES as readonly number[]).includes(raw)) {
    return raw as TargetScore;
  }
  return 151;
}

export function dealHands(seed: string, roundNo: number): CardId[][] {
  const rng = createRng(seed, [roundNo, 0, 0]);
  const deck = shuffle(CARD_IDS, rng);
  return [deck.slice(0, 8), deck.slice(8, 16), deck.slice(16, 24), deck.slice(24, 32)];
}

export function createGame(config: GameConfig, seed: string): GameState {
  if (config.players.length !== 4) {
    throw new Error(`Bazar Blot requires exactly 4 players, got ${config.players.length}`);
  }
  if (!isValidSeed(seed)) {
    throw new Error('Seed must be 64 lowercase hex characters (256 bits)');
  }

  const rng = createRng(seed, [0, 0, 0]);
  const firstPlayer =
    config.startingPlayerIndex !== undefined
      ? ((config.startingPlayerIndex % 4) + 4) % 4
      : rng.nextInt(4);
  const dealer = (firstPlayer + 3) % 4;
  const roundNo = 1;
  const hands = dealHands(seed, roundNo);

  return {
    version: 0,
    status: 'playing',
    options: { targetScore: resolveTargetScore(config.options?.targetScore) },
    seed,
    players: config.players.map((p) => ({ id: p.id, name: p.name })),
    roundNo,
    dealer,
    turnSeq: 0,
    currentSeat: nextSeat(dealer),
    phase: 'bidding',
    hands,
    bidding: {
      calls: [],
      high: null,
      passesInRow: 0,
      kontraBy: null,
      responders: [],
    },
    contract: null,
    trick: {
      leader: nextSeat(dealer),
      plays: [],
    },
    lastTrick: null,
    captured: {
      points: [0, 0],
      tricks: [0, 0],
    },
    combos: {
      bySeat: [[], [], [], []],
      announcedSeats: [false, false, false, false],
      resolved: null,
      blot: null,
    },
    scores: [0, 0],
    rounds: [],
    log: [],
    result: null,
  };
}
