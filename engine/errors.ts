/**
 * Rule violations reported by the engine. The UI shows `message` as the
 * "why is this disabled" reason (FR-10); `code` is stable for programmatic use.
 * All user-facing engine text lives here so it can be translated later.
 */

export type RuleErrorCode =
  | 'GAME_FINISHED'
  | 'UNKNOWN_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'MALFORMED_ACTION'
  | 'DUPLICATE_COLORS'
  | 'WRONG_COLOR_COUNT'
  | 'COLOR_UNAVAILABLE'
  | 'NO_TOKENS_AVAILABLE'
  | 'TAKE_TWO_NEEDS_FOUR'
  | 'RESERVE_LIMIT'
  | 'CARD_NOT_IN_MARKET'
  | 'DECK_EMPTY'
  | 'CARD_NOT_RESERVED'
  | 'CANNOT_AFFORD'
  | 'WRONG_RETURN_COUNT'
  | 'RETURN_EXCEEDS_HOLDINGS'
  | 'NOBLE_NOT_AVAILABLE'
  | 'PASS_NOT_ALLOWED';

export interface RuleError {
  code: RuleErrorCode;
  message: string;
}

export const ruleMessages = {
  GAME_FINISHED: () => 'The game is over.',
  UNKNOWN_PLAYER: () => 'You are not seated in this game.',
  NOT_YOUR_TURN: () => 'It is not your turn.',
  WRONG_PHASE: (expected: string) => `Finish the current step first: ${expected}.`,
  MALFORMED_ACTION: (detail: string) => `Invalid action: ${detail}.`,
  DUPLICATE_COLORS: () => 'Each token must be a different color.',
  WRONG_COLOR_COUNT: (required: number) =>
    required === 3
      ? 'Take exactly 3 different colors.'
      : `Only ${required} color${required === 1 ? ' is' : 's are'} left: take ${required === 1 ? 'it' : `one of each`}.`,
  COLOR_UNAVAILABLE: (color: string) => `There are no ${color} tokens left.`,
  NO_TOKENS_AVAILABLE: () => 'There are no gem tokens left to take.',
  TAKE_TWO_NEEDS_FOUR: (color: string, min: number) =>
    `Two ${color} tokens can only be taken when at least ${min} remain.`,
  RESERVE_LIMIT: (max: number) => `You already hold ${max} reserved cards.`,
  CARD_NOT_IN_MARKET: () => 'That card is not on the board.',
  DECK_EMPTY: (level: number) => `The level ${level} deck is empty.`,
  CARD_NOT_RESERVED: () => 'That card is not in your reserve.',
  CANNOT_AFFORD: (missing: number) =>
    `Not enough tokens: ${missing} more gold or matching gem${missing === 1 ? '' : 's'} needed.`,
  WRONG_RETURN_COUNT: (count: number) =>
    `Return exactly ${count} token${count === 1 ? '' : 's'} to get down to the limit.`,
  RETURN_EXCEEDS_HOLDINGS: (color: string) => `You do not have that many ${color} tokens.`,
  NOBLE_NOT_AVAILABLE: () => 'That noble cannot visit you this turn.',
  PASS_NOT_ALLOWED: () => 'You can only pass when no other action is possible.',
} satisfies Record<RuleErrorCode, (...args: never[]) => string>;

export const phaseLabels = {
  action: 'take your turn action',
  returnTokens: 'return tokens down to the limit',
  chooseNoble: 'choose which noble visits you',
} as const;

export function ruleError<C extends RuleErrorCode>(
  code: C,
  ...args: Parameters<(typeof ruleMessages)[C]>
): RuleError {
  const format = ruleMessages[code] as (...a: unknown[]) => string;
  return { code, message: format(...args) };
}
