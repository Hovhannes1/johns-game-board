import { contextFromState } from './context';
import {
  bonusesOf,
  cardById,
  currentPlayer,
  meetsRequirement,
  nobleById,
  pointsOf,
} from './derive';
import type { RuleError } from './errors';
import { compactCounts, sumCounts, TOKEN_COLORS } from './gems';
import type { GemColor } from './gems';
import { computePayment } from './payment';
import { LEVELS } from './types';
import type {
  ActionIntent,
  GameAction,
  GameEndReason,
  GameEvent,
  GameResult,
  GameState,
  Level,
  LogEntry,
  PlayerState,
  Standing,
  TieBreak,
} from './types';
import { deepFreeze } from './util';
import { normalizeIntent, validateIntent } from './validate';

export type ApplyResult =
  { ok: true; state: GameState; entry: LogEntry } | { ok: false; error: RuleError };

/** Validates an action against the full state. Returns null when legal. */
export function validateAction(state: GameState, action: GameAction): RuleError | null {
  return validateIntent(contextFromState(state), action.playerId, action);
}

/**
 * Applies an action and returns a new state; the input is never mutated.
 * Rejected actions leave the game untouched and return the rule error.
 */
export function applyAction(state: GameState, action: GameAction): ApplyResult {
  const error = validateAction(state, action);
  if (error) return { ok: false, error };

  const next = cloneState(state);
  const intent = normalizeIntent(action);
  const events: GameEvent[] = [];
  perform(next, intent, events);

  next.version += 1;
  // Log entries are shared between state copies and views, so they are immutable.
  const entry: LogEntry = deepFreeze({
    seq: next.version,
    playerId: action.playerId,
    action: intent,
    events,
  });
  next.log.push(entry);
  return { ok: true, state: next, entry };
}

// ---------------------------------------------------------------------------
// Internals: everything below operates on a private, already-cloned draft.
// ---------------------------------------------------------------------------

function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      tokens: { ...p.tokens },
      purchased: [...p.purchased],
      reserved: p.reserved.map((r) => ({ ...r })),
      nobles: [...p.nobles],
    })),
    phase:
      s.phase.kind === 'chooseNoble'
        ? { ...s.phase, options: [...s.phase.options] }
        : { ...s.phase },
    supply: { ...s.supply },
    decks: { 1: [...s.decks[1]], 2: [...s.decks[2]], 3: [...s.decks[3]] },
    market: { 1: [...s.market[1]], 2: [...s.market[2]], 3: [...s.market[3]] },
    nobles: [...s.nobles],
    log: [...s.log],
  };
}

function perform(state: GameState, intent: ActionIntent, events: GameEvent[]): void {
  const player = currentPlayer(state);
  switch (intent.type) {
    case 'TAKE_THREE':
      takeTokens(
        state,
        player,
        intent.colors.map((color) => [color, 1] as const),
        events,
      );
      return afterMainAction(state, events);
    case 'TAKE_TWO':
      takeTokens(state, player, [[intent.color, 2]], events);
      return afterMainAction(state, events);
    case 'RESERVE_FACE_UP': {
      const { level, slot } = locateInMarket(state, intent.cardId);
      reserve(state, player, intent.cardId, level, false, events);
      refillSlot(state, level, slot, events);
      return afterMainAction(state, events);
    }
    case 'RESERVE_FROM_DECK': {
      const cardId = state.decks[intent.level].shift();
      if (!cardId) throw new Error('Invariant: validated deck is empty');
      reserve(state, player, cardId, intent.level, true, events);
      return afterMainAction(state, events);
    }
    case 'BUY_FACE_UP': {
      const { level, slot } = locateInMarket(state, intent.cardId);
      purchase(state, player, intent.cardId, false, events);
      refillSlot(state, level, slot, events);
      return afterMainAction(state, events);
    }
    case 'BUY_RESERVED':
      player.reserved = player.reserved.filter((r) => r.cardId !== intent.cardId);
      purchase(state, player, intent.cardId, true, events);
      return afterMainAction(state, events);
    case 'PASS':
      state.consecutivePasses += 1;
      events.push({ type: 'PASSED', playerId: player.id });
      return resolveNobles(state, events);
    case 'RETURN_TOKENS':
      for (const color of TOKEN_COLORS) {
        const n = intent.tokens[color] ?? 0;
        player.tokens[color] -= n;
        state.supply[color] += n;
      }
      events.push({ type: 'TOKENS_RETURNED', playerId: player.id, tokens: { ...intent.tokens } });
      return resolveNobles(state, events);
    case 'CHOOSE_NOBLE':
      awardNoble(state, player, intent.nobleId, events);
      return endTurn(state, events);
  }
}

function takeTokens(
  state: GameState,
  player: PlayerState,
  picks: readonly (readonly [GemColor, number])[],
  events: GameEvent[],
): void {
  const taken: Partial<Record<GemColor, number>> = {};
  for (const [color, n] of picks) {
    state.supply[color] -= n;
    player.tokens[color] += n;
    taken[color] = (taken[color] ?? 0) + n;
  }
  events.push({ type: 'TOKENS_TAKEN', playerId: player.id, tokens: taken });
}

function locateInMarket(state: GameState, cardId: string): { level: Level; slot: number } {
  for (const level of LEVELS) {
    const slot = state.market[level].indexOf(cardId);
    if (slot >= 0) return { level, slot };
  }
  throw new Error(`Invariant: validated card ${cardId} is not in the market`);
}

/** Replaces a taken face-up card from the same level deck; empty deck leaves a gap. */
function refillSlot(state: GameState, level: Level, slot: number, events: GameEvent[]): void {
  const next = state.decks[level].shift() ?? null;
  state.market[level][slot] = next;
  if (next) events.push({ type: 'CARD_DEALT', level, slot, cardId: next });
}

function reserve(
  state: GameState,
  player: PlayerState,
  cardId: string,
  level: Level,
  fromDeck: boolean,
  events: GameEvent[],
): void {
  player.reserved.push({ cardId, fromDeck });
  // No gold left: the reserve still happens, just without a joker.
  const gold = state.supply.gold > 0 ? 1 : 0;
  state.supply.gold -= gold;
  player.tokens.gold += gold;
  events.push({ type: 'CARD_RESERVED', playerId: player.id, cardId, level, fromDeck, gold });
}

function purchase(
  state: GameState,
  player: PlayerState,
  cardId: string,
  fromReserve: boolean,
  events: GameEvent[],
): void {
  const card = cardById(state.catalog, cardId);
  const plan = computePayment(card.cost, bonusesOf(state.catalog, player), player.tokens);
  if (!plan.affordable) throw new Error('Invariant: validated purchase is unaffordable');
  for (const color of TOKEN_COLORS) {
    player.tokens[color] -= plan.payment[color];
    state.supply[color] += plan.payment[color];
  }
  player.purchased.push(cardId);
  events.push({
    type: 'CARD_PURCHASED',
    playerId: player.id,
    cardId,
    fromReserve,
    payment: compactCounts(plan.payment),
  });
}

/** End-of-turn checks, in order: token limit, noble visit, end-game trigger (2.3). */
function afterMainAction(state: GameState, events: GameEvent[]): void {
  state.consecutivePasses = 0;
  const player = currentPlayer(state);
  const excess = sumCounts(player.tokens) - state.rules.maxTokens;
  if (excess > 0) {
    state.phase = { kind: 'returnTokens', count: excess };
    return;
  }
  resolveNobles(state, events);
}

function resolveNobles(state: GameState, events: GameEvent[]): void {
  const player = currentPlayer(state);
  const bonuses = bonusesOf(state.catalog, player);
  const eligible = state.nobles.filter((id) =>
    meetsRequirement(bonuses, nobleById(state.catalog, id).requires),
  );
  if (eligible.length === 1) awardNoble(state, player, eligible[0]!, events);
  if (eligible.length > 1) {
    state.phase = { kind: 'chooseNoble', options: eligible };
    return;
  }
  endTurn(state, events);
}

function awardNoble(
  state: GameState,
  player: PlayerState,
  nobleId: string,
  events: GameEvent[],
): void {
  state.nobles = state.nobles.filter((id) => id !== nobleId);
  player.nobles.push(nobleId);
  // A visit changes the position, so a run of passes no longer means deadlock.
  state.consecutivePasses = 0;
  events.push({ type: 'NOBLE_VISITED', playerId: player.id, nobleId });
}

function endTurn(state: GameState, events: GameEvent[]): void {
  const player = currentPlayer(state);
  player.turnsTaken += 1;
  state.phase = { kind: 'action' };

  if (!state.finalRound) {
    const points = pointsOf(state.catalog, player);
    if (points >= state.rules.targetPoints) {
      state.finalRound = true;
      events.push({ type: 'FINAL_ROUND', playerId: player.id, points });
    }
  }

  // Everyone passed in a row with nothing changing: no one can ever act again.
  if (state.consecutivePasses >= state.players.length) {
    return finishGame(state, 'stalemate', events);
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  if (nextIndex === state.startPlayerIndex) {
    // The round is complete; everyone has had the same number of turns.
    if (state.finalRound) return finishGame(state, 'targetReached', events);
    state.round += 1;
  }
  state.currentPlayerIndex = nextIndex;
}

function finishGame(state: GameState, reason: GameEndReason, events: GameEvent[]): void {
  state.status = 'finished';
  state.result = computeResult(state, reason);
  events.push({ type: 'GAME_ENDED', reason, winners: [...state.result.winners] });
}

/** Highest prestige wins; ties go to fewest purchased cards; then a shared win (2.4). */
export function computeResult(state: GameState, reason: GameEndReason): GameResult {
  const rows = state.players.map((p) => ({
    playerId: p.id,
    points: pointsOf(state.catalog, p),
    purchasedCount: p.purchased.length,
  }));
  const better = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    a.points > b.points || (a.points === b.points && a.purchasedCount < b.purchasedCount);

  const standings: Standing[] = rows
    .map((row) => ({ ...row, rank: 1 + rows.filter((other) => better(other, row)).length }))
    .sort((a, b) => a.rank - b.rank);

  const topPoints = Math.max(...rows.map((r) => r.points));
  const contenders = rows.filter((r) => r.points === topPoints);
  const winners = standings.filter((s) => s.rank === 1).map((s) => s.playerId);
  let tieBreak: TieBreak = 'none';
  if (contenders.length > 1) tieBreak = winners.length === 1 ? 'fewestCards' : 'shared';

  return deepFreeze({ reason, winners, tieBreak, standings });
}

/** Points per player, handy for UIs and tests. */
export function scoreboard(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of state.players) out[p.id] = pointsOf(state.catalog, p);
  return out;
}
