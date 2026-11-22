import { emptyTokens, GEM_COLORS } from './gems';
import type { GemCounts, TokenCounts } from './gems';

export interface PaymentPlan {
  affordable: boolean;
  /** Tokens that will be paid (gold included). Partial when not affordable. */
  payment: TokenCounts;
  /** How many more tokens (gold or matching gems) are missing. 0 when affordable. */
  missing: number;
}

/**
 * Cheapest payment for a card (section 2.5): bonuses discount first, then the
 * player's own gem tokens, then gold covers whatever is still short.
 * Works on plain data so the UI can preview the exact payment before confirming.
 */
export function computePayment(
  cost: GemCounts,
  bonuses: GemCounts,
  tokens: TokenCounts,
): PaymentPlan {
  const payment = emptyTokens();
  let shortfall = 0;
  for (const color of GEM_COLORS) {
    const need = Math.max(0, cost[color] - bonuses[color]);
    const fromGems = Math.min(need, tokens[color]);
    payment[color] = fromGems;
    shortfall += need - fromGems;
  }
  payment.gold = Math.min(shortfall, tokens.gold);
  const missing = shortfall - payment.gold;
  return { affordable: missing === 0, payment, missing };
}
