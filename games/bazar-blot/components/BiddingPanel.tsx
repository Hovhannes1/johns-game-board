'use client';

import { useState } from 'react';
import type { ActionIntent, GameView, Strain } from '@/games/bazar-blot/engine';
import { MAX_BID, MIN_BID, isValidBid } from '@/games/bazar-blot/engine';
import { strings } from '@/games/bazar-blot/lib/strings';
import { Button } from '@/platform/ui/Dialog';

const STRAINS: readonly Strain[] = ['S', 'H', 'D', 'C', 'BOY'];

export function BiddingPanel({
  view,
  onIntent,
}: {
  view: GameView;
  onIntent: (intent: ActionIntent) => void;
}) {
  const high = view.bidding.high;
  const minVal = high ? (high.bid.kaput ? high.bid.value + 1 : high.bid.value + 1) : MIN_BID;
  const [rawValue, setRawValue] = useState(minVal);
  const [strain, setStrain] = useState<Strain>('H');
  const [kaput, setKaput] = useState(Boolean(high?.bid.kaput));

  const value = Math.max(kaput && !high?.bid.kaput ? MIN_BID : minVal, Math.min(MAX_BID, rawValue));
  const isMyTurn = view.viewerSeat !== null && view.viewerSeat === view.currentSeat;
  const currentName = view.players[view.currentSeat]?.name ?? '';
  const effectiveKaput = Boolean(high?.bid.kaput) || kaput;
  const canBid = isValidBid(high, { value, strain, kaput: effectiveKaput });

  const highLabel = high
    ? `${high.bid.kaput ? `${strings.bidding.kaput} ` : ''}${high.bid.value} ${strings.strains[high.bid.strain]} (${view.players[high.seat]?.name})`
    : strings.bidding.noBidYet;

  return (
    <section
      aria-label={strings.bidding.title}
      className="flex flex-col gap-3 rounded-2xl border border-brass/35 bg-felt-900/85 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl text-brass">{strings.bidding.title}</h2>
        <span className="text-sm text-parchment/85">
          High bid: <strong className="text-brass">{highLabel}</strong>
        </span>
      </div>

      {view.bidding.calls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs text-parchment/75">
          {view.bidding.calls.slice(-8).map((c, idx) => (
            <span
              key={idx}
              className="rounded-md border border-parchment/15 bg-felt-950/60 px-2 py-0.5"
            >
              {view.players[c.seat]?.name}:{' '}
              {c.type === 'BID'
                ? `${c.bid.kaput ? 'Kaput ' : ''}${c.bid.value} ${c.bid.strain === 'BOY' ? 'Boy' : strings.suitSymbols[c.bid.strain]}`
                : c.type}
            </span>
          ))}
        </div>
      )}

      {!isMyTurn ? (
        <p role="status" className="text-sm text-parchment/75">
          {view.phase === 'kontra'
            ? strings.bidding.kontraPrompt(view.players[view.bidding.kontraBy!]?.name ?? '')
            : strings.bidding.waitingFor(currentName)}
        </p>
      ) : view.phase === 'kontra' ? (
        <div className="flex flex-wrap items-center gap-2">
          {view.bidding.canRekontra && (
            <Button onClick={() => onIntent({ type: 'REKONTRA' })}>
              {strings.bidding.rekontra}
            </Button>
          )}
          <Button variant="secondary" onClick={() => onIntent({ type: 'PASS' })}>
            {strings.bidding.pass}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-parchment/20 bg-felt-950 px-2 py-1">
              <button
                type="button"
                aria-label="Decrease bid"
                onClick={() => setRawValue((v) => Math.max(MIN_BID, v - 1))}
                className="px-2 py-0.5 text-sm font-bold hover:text-brass"
              >
                −
              </button>
              <span className="min-w-[2ch] text-center font-mono font-bold tabular-nums">
                {value}
              </span>
              <button
                type="button"
                aria-label="Increase bid"
                onClick={() => setRawValue((v) => Math.min(MAX_BID, v + 1))}
                className="px-2 py-0.5 text-sm font-bold hover:text-brass"
              >
                +
              </button>
            </div>

            <div className="flex flex-wrap gap-1">
              {STRAINS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrain(s)}
                  className={`rounded-lg border px-2.5 py-1 text-sm font-semibold transition-colors ${
                    strain === s
                      ? 'border-brass bg-brass text-felt-950'
                      : 'border-parchment/25 bg-felt-950/60 text-parchment hover:border-brass/60'
                  }`}
                >
                  {s === 'BOY' ? 'Boy' : strings.suitSymbols[s]}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={effectiveKaput}
                disabled={Boolean(high?.bid.kaput)}
                onChange={(e) => setKaput(e.target.checked)}
              />
              {strings.bidding.kaput}
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabledReason={canBid ? null : 'Bid must outrank current high bid'}
              onClick={() => onIntent({ type: 'BID', value, strain, kaput: effectiveKaput })}
            >
              {strings.bidding.bid} {value} {strain === 'BOY' ? 'Boy' : strings.suitSymbols[strain]}
            </Button>
            <Button variant="secondary" onClick={() => onIntent({ type: 'PASS' })}>
              {strings.bidding.pass}
            </Button>
            {view.bidding.canKontra && (
              <Button variant="ghost" onClick={() => onIntent({ type: 'KONTRA' })}>
                {strings.bidding.kontra}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
