export type RuleErrorCode =
  | 'MALFORMED_ACTION'
  | 'GAME_FINISHED'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'INVALID_BID'
  | 'CANNOT_KONTRA'
  | 'CANNOT_REKONTRA'
  | 'CARD_NOT_IN_HAND'
  | 'MUST_FOLLOW_SUIT'
  | 'MUST_TRUMP'
  | 'MUST_OVERTRUMP';

export interface RuleError {
  code: RuleErrorCode;
  message: string;
}

export const ruleMessages: Record<RuleErrorCode, string> = {
  MALFORMED_ACTION: 'That move is not valid.',
  GAME_FINISHED: 'The match has already ended.',
  NOT_YOUR_TURN: 'It is not your turn.',
  WRONG_PHASE: 'That action is not allowed right now.',
  INVALID_BID: 'Your bid must be higher than the current bid.',
  CANNOT_KONTRA: 'Only a defender can declare Kontra against an active bid.',
  CANNOT_REKONTRA: 'Only the bidding team can declare Rekontra.',
  CARD_NOT_IN_HAND: 'You do not hold that card.',
  MUST_FOLLOW_SUIT: 'You must follow the led suit.',
  MUST_TRUMP: 'You must play a trump card.',
  MUST_OVERTRUMP: 'You must play a higher trump than the one on the table.',
};

export function ruleError(code: RuleErrorCode, message?: string): RuleError {
  return { code, message: message ?? ruleMessages[code] };
}
