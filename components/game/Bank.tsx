'use client';

import { GEM_COLORS } from '@/engine';
import type { ActionIntent, GameView, GemColor, RuleError } from '@/engine';
import { TokenChip } from '@/components/art/TokenChip';
import { Button } from '@/components/ui/Dialog';
import { canAddGem } from '@/lib/selection';
import type { GemSelection } from '@/lib/selection';
import { strings } from '@/lib/strings';

interface BankProps {
  view: GameView;
  selection: GemSelection;
  canAct: boolean;
  onAdd: (color: GemColor) => void;
}

/** The token supply (FR-7). Gem piles are buttons while it is the viewer's turn. */
export function Bank({ view, selection, canAct, onAdd }: BankProps) {
  return (
    <section
      aria-label={strings.table.supply}
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5"
    >
      <h2 className="text-xs font-semibold tracking-[0.2em] text-parchment/60 uppercase">
        {strings.table.supply}
      </h2>
      <ul className="grid grid-cols-6 justify-items-center gap-1 sm:w-max sm:gap-3">
        {GEM_COLORS.map((color) => {
          const picked = selection.filter((c) => c === color).length;
          const check = canAddGem(selection, color, view.supply, view.rules);
          const enabled = canAct && check.ok;
          const label = strings.tokens.take(
            `${strings.gems[color]} (${strings.gemColors[color]})`,
            view.supply[color],
          );
          return (
            <li key={color} data-anchor={`bank-${color}`}>
              <button
                type="button"
                aria-label={label}
                aria-disabled={!enabled || undefined}
                title={canAct && !check.ok ? check.reason : label}
                onClick={enabled ? () => onAdd(color) : undefined}
                className={`rounded-full p-1 ${enabled ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <TokenChip
                  color={color}
                  count={view.supply[color] - picked}
                  dimmed={view.supply[color] - picked === 0}
                />
              </button>
            </li>
          );
        })}
        <li data-anchor="bank-gold">
          <span
            role="img"
            aria-label={`${strings.gems.gold}, ${view.supply.gold} in the bank. ${strings.tokens.goldHint}`}
            title={strings.tokens.goldHint}
            className="inline-block p-1"
          >
            <TokenChip
              color="gold"
              size="bank"
              count={view.supply.gold}
              dimmed={view.supply.gold === 0}
            />
          </span>
        </li>
      </ul>
    </section>
  );
}

interface SelectionTrayProps {
  selection: GemSelection;
  intent: ActionIntent | null;
  problem: RuleError | null;
  onRemove: (color: GemColor) => void;
  onClear: () => void;
  onConfirm: () => void;
}

/** Picked gems with undo, the engine's verdict, and confirm (FR-11). */
export function SelectionTray({
  selection,
  intent,
  problem,
  onRemove,
  onClear,
  onConfirm,
}: SelectionTrayProps) {
  const hint =
    selection.length === 0 ? strings.tokens.pickHint : (problem?.message ?? strings.tokens.ready);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-parchment/10 bg-felt-900/60 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold tracking-[0.2em] text-parchment/60 uppercase">
          {strings.tokens.selected}
        </span>
        <ul className="flex min-h-[2.4rem] items-center gap-1.5">
          {selection.map((color, i) => (
            <li key={`${color}-${i}`}>
              <button
                type="button"
                aria-label={strings.tokens.removeSelected(strings.gems[color])}
                onClick={() => onRemove(color)}
                className="rounded-full"
              >
                <TokenChip color={color} size="sm" raised />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p role="status" aria-live="polite" className="min-w-0 text-sm text-parchment/80 sm:flex-1">
        {hint}
      </p>
      <div className="flex gap-2 sm:ml-auto">
        <Button
          variant="ghost"
          onClick={onClear}
          disabledReason={selection.length === 0 ? strings.tokens.pickHint : null}
        >
          {strings.tokens.clear}
        </Button>
        <Button
          onClick={onConfirm}
          disabledReason={!intent ? strings.tokens.pickHint : (problem?.message ?? null)}
        >
          {strings.tokens.confirm}
        </Button>
      </div>
    </div>
  );
}
