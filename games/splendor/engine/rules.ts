import type { RuleSet } from './types';

/** Base-game rules (section 2 of the spec). */
export const BASE_RULES: Readonly<RuleSet> = Object.freeze({
  minPlayers: 2,
  maxPlayers: 4,
  targetPoints: 15,
  maxTokens: 10,
  maxReserved: 3,
  takeTwoMinSupply: 4,
  marketSize: 4,
  goldTokens: 5,
  gemTokensByPlayers: Object.freeze({ 2: 4, 3: 5, 4: 7 }),
  noblesByPlayers: Object.freeze({ 2: 3, 3: 4, 4: 5 }),
});

/** The most different colors a TAKE_THREE action can take. */
export const TAKE_DIFFERENT_MAX = 3;

export function resolveRules(overrides: Partial<RuleSet> | undefined): RuleSet {
  return {
    ...BASE_RULES,
    ...overrides,
    gemTokensByPlayers: { ...BASE_RULES.gemTokensByPlayers, ...overrides?.gemTokensByPlayers },
    noblesByPlayers: { ...BASE_RULES.noblesByPlayers, ...overrides?.noblesByPlayers },
  };
}
