import type { PlayerContext, RulesContext } from './context';
import { phaseLabels, ruleError } from './errors';
import type { RuleError } from './errors';
import { compactCounts, GEM_COLORS, isGemColor, isTokenColor, TOKEN_COLORS } from './gems';
import type { TokenColor } from './gems';
import { computePayment } from './payment';
import { TAKE_DIFFERENT_MAX } from './rules';
import { ACTION_TYPES, LEVELS } from './types';
import type { ActionIntent, ActionType, CardDef, Level, TurnPhase } from './types';

const PHASE_ACTIONS: Record<TurnPhase['kind'], readonly ActionType[]> = {
  action: [
    'TAKE_THREE',
    'TAKE_TWO',
    'RESERVE_FACE_UP',
    'RESERVE_FROM_DECK',
    'BUY_FACE_UP',
    'BUY_RESERVED',
    'PASS',
  ],
  returnTokens: ['RETURN_TOKENS'],
  chooseNoble: ['CHOOSE_NOBLE'],
};

export function allowedActionTypes(phase: TurnPhase): readonly ActionType[] {
  return PHASE_ACTIONS[phase.kind];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLevel(value: unknown): value is Level {
  return (LEVELS as readonly unknown[]).includes(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function findInMarket(ctx: RulesContext, cardId: string): CardDef | undefined {
  for (const level of LEVELS) {
    const card = ctx.market[level].find((c) => c?.id === cardId);
    if (card) return card;
  }
  return undefined;
}

export function availableGemColorCount(ctx: RulesContext): number {
  return GEM_COLORS.filter((color) => ctx.supply[color] > 0).length;
}

/**
 * Validates an untrusted intent for `playerId`. Returns null when legal.
 * Shape is checked defensively even though the server validates messages with
 * Zod first: no client value is trusted (SEC-8).
 */
export function validateIntent(
  ctx: RulesContext,
  playerId: string,
  intent: unknown,
): RuleError | null {
  if (ctx.status === 'finished') return ruleError('GAME_FINISHED');
  const player = ctx.players.find((p) => p.id === playerId);
  if (!player) return ruleError('UNKNOWN_PLAYER');
  if (ctx.currentPlayerId !== playerId) return ruleError('NOT_YOUR_TURN');
  if (!isRecord(intent) || !(ACTION_TYPES as readonly unknown[]).includes(intent.type)) {
    return ruleError('MALFORMED_ACTION', 'unknown action type');
  }
  const type = intent.type as ActionType;
  if (!PHASE_ACTIONS[ctx.phase.kind].includes(type)) {
    return ruleError('WRONG_PHASE', phaseLabels[ctx.phase.kind]);
  }

  switch (type) {
    case 'TAKE_THREE':
      return validateTakeDifferent(ctx, intent.colors);
    case 'TAKE_TWO':
      return validateTakeTwo(ctx, intent.color);
    case 'RESERVE_FACE_UP':
      return validateReserveFaceUp(ctx, player, intent.cardId);
    case 'RESERVE_FROM_DECK':
      return validateReserveFromDeck(ctx, player, intent.level);
    case 'BUY_FACE_UP':
      return validateBuyFaceUp(ctx, player, intent.cardId);
    case 'BUY_RESERVED':
      return validateBuyReserved(player, intent.cardId);
    case 'RETURN_TOKENS':
      return validateReturn(ctx, player, intent.tokens);
    case 'CHOOSE_NOBLE':
      return validateChooseNoble(ctx, intent.nobleId);
    case 'PASS':
      return hasAnyMainAction(ctx, player) ? ruleError('PASS_NOT_ALLOWED') : null;
  }
}

function validateTakeDifferent(ctx: RulesContext, colors: unknown): RuleError | null {
  if (!Array.isArray(colors) || !colors.every(isGemColor)) {
    return ruleError('MALFORMED_ACTION', 'colors must be a list of gem colors');
  }
  if (new Set(colors).size !== colors.length) return ruleError('DUPLICATE_COLORS');
  const available = availableGemColorCount(ctx);
  if (available === 0) return ruleError('NO_TOKENS_AVAILABLE');
  for (const color of colors) {
    if (ctx.supply[color] === 0) return ruleError('COLOR_UNAVAILABLE', color);
  }
  // Decision 2.5: take as many different colors as are available, up to 3, at least 1.
  const required = Math.min(TAKE_DIFFERENT_MAX, available);
  if (colors.length !== required) return ruleError('WRONG_COLOR_COUNT', required);
  return null;
}

function validateTakeTwo(ctx: RulesContext, color: unknown): RuleError | null {
  if (!isGemColor(color)) return ruleError('MALFORMED_ACTION', 'color must be a gem color');
  const min = ctx.rules.takeTwoMinSupply;
  if (ctx.supply[color] < min) return ruleError('TAKE_TWO_NEEDS_FOUR', color, min);
  return null;
}

function validateReserveFaceUp(
  ctx: RulesContext,
  player: PlayerContext,
  cardId: unknown,
): RuleError | null {
  if (typeof cardId !== 'string') return ruleError('MALFORMED_ACTION', 'cardId must be a string');
  if (player.reserved.length >= ctx.rules.maxReserved) {
    return ruleError('RESERVE_LIMIT', ctx.rules.maxReserved);
  }
  if (!findInMarket(ctx, cardId)) return ruleError('CARD_NOT_IN_MARKET');
  return null;
}

function validateReserveFromDeck(
  ctx: RulesContext,
  player: PlayerContext,
  level: unknown,
): RuleError | null {
  if (!isLevel(level)) return ruleError('MALFORMED_ACTION', 'level must be 1, 2 or 3');
  if (player.reserved.length >= ctx.rules.maxReserved) {
    return ruleError('RESERVE_LIMIT', ctx.rules.maxReserved);
  }
  if (ctx.deckCounts[level] === 0) return ruleError('DECK_EMPTY', level);
  return null;
}

function affordability(card: CardDef, player: PlayerContext): RuleError | null {
  const plan = computePayment(card.cost, player.bonuses, player.tokens);
  return plan.affordable ? null : ruleError('CANNOT_AFFORD', plan.missing);
}

function validateBuyFaceUp(
  ctx: RulesContext,
  player: PlayerContext,
  cardId: unknown,
): RuleError | null {
  if (typeof cardId !== 'string') return ruleError('MALFORMED_ACTION', 'cardId must be a string');
  const card = findInMarket(ctx, cardId);
  if (!card) return ruleError('CARD_NOT_IN_MARKET');
  return affordability(card, player);
}

function validateBuyReserved(player: PlayerContext, cardId: unknown): RuleError | null {
  if (typeof cardId !== 'string') return ruleError('MALFORMED_ACTION', 'cardId must be a string');
  const card = player.reserved.find((c) => c?.id === cardId);
  if (!card) return ruleError('CARD_NOT_RESERVED');
  return affordability(card, player);
}

function validateReturn(
  ctx: RulesContext,
  player: PlayerContext,
  tokens: unknown,
): RuleError | null {
  if (ctx.phase.kind !== 'returnTokens') return ruleError('WRONG_PHASE', phaseLabels.action);
  if (!isRecord(tokens)) return ruleError('MALFORMED_ACTION', 'tokens must be an object');
  let total = 0;
  for (const [color, count] of Object.entries(tokens)) {
    if (!isTokenColor(color)) return ruleError('MALFORMED_ACTION', `unknown token color ${color}`);
    if (!isNonNegativeInt(count)) {
      return ruleError('MALFORMED_ACTION', 'token counts must be non-negative integers');
    }
    if (count > player.tokens[color]) return ruleError('RETURN_EXCEEDS_HOLDINGS', color);
    total += count;
  }
  if (total !== ctx.phase.count) return ruleError('WRONG_RETURN_COUNT', ctx.phase.count);
  return null;
}

function validateChooseNoble(ctx: RulesContext, nobleId: unknown): RuleError | null {
  if (typeof nobleId !== 'string') return ruleError('MALFORMED_ACTION', 'nobleId must be a string');
  if (ctx.phase.kind !== 'chooseNoble' || !ctx.phase.options.includes(nobleId)) {
    return ruleError('NOBLE_NOT_AVAILABLE');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Candidate enumeration (shared with legal-move listing)
// ---------------------------------------------------------------------------

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), size - 1)) out.push([item, ...rest]);
  });
  return out;
}

/** Every main-phase action worth checking for `player`, excluding PASS. */
export function mainActionCandidates(ctx: RulesContext, player: PlayerContext): ActionIntent[] {
  const candidates: ActionIntent[] = [];
  const availableColors = GEM_COLORS.filter((color) => ctx.supply[color] > 0);
  const takeCount = Math.min(TAKE_DIFFERENT_MAX, availableColors.length);
  if (takeCount > 0) {
    for (const colors of combinations(availableColors, takeCount)) {
      candidates.push({ type: 'TAKE_THREE', colors });
    }
  }
  for (const color of GEM_COLORS) candidates.push({ type: 'TAKE_TWO', color });
  for (const level of LEVELS) {
    for (const card of ctx.market[level]) {
      if (card) candidates.push({ type: 'RESERVE_FACE_UP', cardId: card.id });
    }
  }
  for (const level of LEVELS) candidates.push({ type: 'RESERVE_FROM_DECK', level });
  for (const level of LEVELS) {
    for (const card of ctx.market[level]) {
      if (card) candidates.push({ type: 'BUY_FACE_UP', cardId: card.id });
    }
  }
  for (const card of player.reserved) {
    if (card) candidates.push({ type: 'BUY_RESERVED', cardId: card.id });
  }
  return candidates;
}

function hasAnyMainAction(ctx: RulesContext, player: PlayerContext): boolean {
  return mainActionCandidates(ctx, player).some(
    (intent) => validateIntent(ctx, player.id, intent) === null,
  );
}

/** All ways to return exactly `count` tokens from `holdings`. */
export function returnCombinations(
  holdings: Record<TokenColor, number>,
  count: number,
): Partial<Record<TokenColor, number>>[] {
  const out: Partial<Record<TokenColor, number>>[] = [];
  const pick = (index: number, remaining: number, acc: Partial<Record<TokenColor, number>>) => {
    if (remaining === 0) {
      out.push(compactCounts(acc));
      return;
    }
    if (index >= TOKEN_COLORS.length) return;
    const color = TOKEN_COLORS[index]!;
    const max = Math.min(holdings[color], remaining);
    for (let n = max; n >= 0; n--) pick(index + 1, remaining - n, { ...acc, [color]: n });
  };
  pick(0, count, {});
  return out;
}

/** Returns a fresh copy of a validated intent containing only known fields. */
export function normalizeIntent(intent: ActionIntent): ActionIntent {
  switch (intent.type) {
    case 'TAKE_THREE':
      return { type: intent.type, colors: [...intent.colors] };
    case 'TAKE_TWO':
      return { type: intent.type, color: intent.color };
    case 'RESERVE_FACE_UP':
    case 'BUY_FACE_UP':
    case 'BUY_RESERVED':
      return { type: intent.type, cardId: intent.cardId };
    case 'RESERVE_FROM_DECK':
      return { type: intent.type, level: intent.level };
    case 'RETURN_TOKENS':
      return { type: intent.type, tokens: compactCounts({ ...intent.tokens }) };
    case 'CHOOSE_NOBLE':
      return { type: intent.type, nobleId: intent.nobleId };
    case 'PASS':
      return { type: intent.type };
  }
}
