import { emptyTokens, GEM_COLORS } from './gems';
import { createRng, shuffle } from './rng';
import { resolveRules } from './rules';
import { LEVELS } from './types';
import type { CardPack, GameCatalog, GameConfig, GameState, PerLevel, PlayerState } from './types';
import { deepFreeze } from './util';

function buildCatalog(pack: CardPack): GameCatalog {
  const cards: GameCatalog['cards'] = {};
  const nobles: GameCatalog['nobles'] = {};
  for (const card of pack.cards) {
    if (cards[card.id]) throw new Error(`Duplicate card id in pack: ${card.id}`);
    cards[card.id] = { ...card, cost: { ...card.cost } };
  }
  for (const noble of pack.nobles) {
    if (nobles[noble.id]) throw new Error(`Duplicate noble id in pack: ${noble.id}`);
    nobles[noble.id] = { ...noble, requires: { ...noble.requires } };
  }
  return deepFreeze({ cards, nobles });
}

function validateConfig(config: GameConfig, playerCount: number, min: number, max: number): void {
  if (playerCount < min || playerCount > max) {
    throw new Error(`A game needs ${min} to ${max} players, got ${playerCount}`);
  }
  const ids = new Set<string>();
  for (const seat of config.players) {
    if (!seat.id) throw new Error('Player id must not be empty');
    if (ids.has(seat.id)) throw new Error(`Duplicate player id: ${seat.id}`);
    ids.add(seat.id);
  }
  const start = config.startingPlayerIndex;
  if (start !== undefined && (!Number.isInteger(start) || start < 0 || start >= playerCount)) {
    throw new Error(`startingPlayerIndex out of range: ${start}`);
  }
}

/**
 * Sets up a new game (section 2.2). Deterministic for a given config and seed.
 *
 * RNG consumption order is part of the replay contract and must not change:
 * level 1 deck, level 2 deck, level 3 deck, nobles, then the starting player.
 */
export function createGame(config: GameConfig, seed: string): GameState {
  const rules = resolveRules(config.rules);
  const playerCount = config.players.length;
  validateConfig(config, playerCount, rules.minPlayers, rules.maxPlayers);

  const gemsPerColor = rules.gemTokensByPlayers[playerCount];
  const nobleCount = rules.noblesByPlayers[playerCount];
  if (gemsPerColor === undefined || nobleCount === undefined) {
    throw new Error(`Rules define no setup for ${playerCount} players`);
  }

  const catalog = buildCatalog(config.pack);
  const rng = createRng(seed);

  const decks: PerLevel<string[]> = { 1: [], 2: [], 3: [] };
  const market: PerLevel<(string | null)[]> = { 1: [], 2: [], 3: [] };
  for (const level of LEVELS) {
    const ids = config.pack.cards.filter((c) => c.level === level).map((c) => c.id);
    const deck = shuffle(ids, rng);
    market[level] = Array.from({ length: rules.marketSize }, () => deck.shift() ?? null);
    decks[level] = deck;
  }

  const nobles = shuffle(
    config.pack.nobles.map((n) => n.id),
    rng,
  ).slice(0, nobleCount);

  const startPlayerIndex = config.startingPlayerIndex ?? rng.nextInt(playerCount);

  const supply = emptyTokens();
  for (const color of GEM_COLORS) supply[color] = gemsPerColor;
  supply.gold = rules.goldTokens;

  const players: PlayerState[] = config.players.map((seat) => ({
    id: seat.id,
    name: seat.name,
    tokens: emptyTokens(),
    purchased: [],
    reserved: [],
    nobles: [],
    turnsTaken: 0,
  }));

  return {
    schemaVersion: 1,
    seed,
    pack: { id: config.pack.id, version: config.pack.version, name: config.pack.name },
    catalog,
    rules: deepFreeze(rules),
    players,
    startPlayerIndex,
    currentPlayerIndex: startPlayerIndex,
    round: 1,
    phase: { kind: 'action' },
    status: 'playing',
    supply,
    decks,
    market,
    nobles,
    finalRound: false,
    consecutivePasses: 0,
    version: 0,
    log: [],
    result: null,
  };
}
