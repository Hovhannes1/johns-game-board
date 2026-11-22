import type { ActionIntent, GemColor, RuleSet, TokenCounts } from '@/games/splendor/engine';
import { strings } from './strings';

/**
 * Gem picking before confirming a take action (FR-11). The selection is an
 * ordered list of colors; a repeated color means "take two of the same".
 * The engine stays the authority: this only decides which piles to offer.
 */
export type GemSelection = readonly GemColor[];

export function selectionToIntent(selection: GemSelection): ActionIntent | null {
  if (selection.length === 0) return null;
  if (selection.length === 2 && selection[0] === selection[1]) {
    return { type: 'TAKE_TWO', color: selection[0]! };
  }
  return { type: 'TAKE_THREE', colors: [...selection] };
}

export type AddCheck = { ok: true } | { ok: false; reason: string };

export function canAddGem(
  selection: GemSelection,
  color: GemColor,
  supply: TokenCounts,
  rules: Pick<RuleSet, 'takeTwoMinSupply'>,
): AddCheck {
  const gem = strings.gems[color];
  const already = selection.filter((c) => c === color).length;
  if (supply[color] - already <= 0) return { ok: false, reason: strings.tokens.noneLeft(gem) };
  const isPair = selection.length === 2 && selection[0] === selection[1];
  if (isPair) return { ok: false, reason: strings.tokens.pairIsFull };
  if (selection.length >= 3) return { ok: false, reason: strings.tokens.maxThree };
  if (already > 0) {
    if (selection.length > 1) return { ok: false, reason: strings.tokens.pairWithOthers };
    if (supply[color] < rules.takeTwoMinSupply) {
      return { ok: false, reason: strings.tokens.pairNeedsFour(gem, rules.takeTwoMinSupply) };
    }
  }
  return { ok: true };
}

export function addGem(selection: GemSelection, color: GemColor): GemSelection {
  return [...selection, color];
}

/** Removes the last occurrence of a color (undo before confirm). */
export function removeGem(selection: GemSelection, color: GemColor): GemSelection {
  const index = selection.lastIndexOf(color);
  if (index < 0) return selection;
  return [...selection.slice(0, index), ...selection.slice(index + 1)];
}
