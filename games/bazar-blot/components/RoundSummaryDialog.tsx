'use client';

import type { RoundSummary } from '@/games/bazar-blot/engine';
import { strings } from '@/games/bazar-blot/lib/strings';
import { Button, Dialog } from '@/platform/ui/Dialog';

const t = strings.roundSummary;

export function RoundSummaryDialog({
  summary,
  onClose,
}: {
  summary: RoundSummary | null;
  onClose: () => void;
}) {
  if (!summary) return null;

  return (
    <Dialog open={true} onClose={onClose} title={t.title(summary.roundNo)}>
      {summary.redeal ? (
        <p className="text-sm text-parchment/85">{t.redeal}</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-semibold text-brass">
            {summary.reverseKaput
              ? t.reverseKaput
              : summary.kaput
                ? t.kaput
                : summary.made
                  ? t.made
                  : t.failed}
          </p>
          <table className="w-full text-left tabular-nums">
            <thead className="text-xs text-parchment/60">
              <tr>
                <th className="py-1" />
                <th className="py-1 text-right">{strings.table.teamLabel(0)}</th>
                <th className="py-1 text-right">{strings.table.teamLabel(1)}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-parchment/10">
                <td className="py-1">{t.trickPts}</td>
                <td className="py-1 text-right">{summary.trickPoints?.[0] ?? 0}</td>
                <td className="py-1 text-right">{summary.trickPoints?.[1] ?? 0}</td>
              </tr>
              <tr className="border-t border-parchment/10">
                <td className="py-1">{t.sai}</td>
                <td className="py-1 text-right">{summary.sai?.[0] ?? 0}</td>
                <td className="py-1 text-right">{summary.sai?.[1] ?? 0}</td>
              </tr>
              <tr className="border-t border-parchment/10">
                <td className="py-1">{t.combos}</td>
                <td className="py-1 text-right">{summary.comboPoints?.[0] ?? 0}</td>
                <td className="py-1 text-right">{summary.comboPoints?.[1] ?? 0}</td>
              </tr>
              <tr className="border-t border-parchment/20 font-semibold text-brass">
                <td className="py-1">{t.awarded}</td>
                <td className="py-1 text-right">+{summary.awarded?.[0] ?? 0}</td>
                <td className="py-1 text-right">+{summary.awarded?.[1] ?? 0}</td>
              </tr>
              <tr className="border-t border-parchment/10 font-semibold">
                <td className="py-1">{t.total}</td>
                <td className="py-1 text-right">{summary.totalsAfter[0]}</td>
                <td className="py-1 text-right">{summary.totalsAfter[1]}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>{t.continue}</Button>
      </div>
    </Dialog>
  );
}
