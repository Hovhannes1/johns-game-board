'use client';

import { useMemo, useState } from 'react';
import { SEQUENCE_ORDER, SUITS, rankOf, suitOf } from '@/games/bazar-blot/engine';
import type { ActionIntent, CardId, GameView } from '@/games/bazar-blot/engine';
import { strings } from '@/games/bazar-blot/lib/strings';
import type { OnlineTableProps } from '@/platform/games/table';
import { Button, Dialog } from '@/platform/ui/Dialog';
import { BiddingPanel } from './BiddingPanel';
import { PlayingCard } from './PlayingCard';
import { RoundSummaryDialog } from './RoundSummaryDialog';
import { ScoreBoard } from './ScoreBoard';
import { TrickArea } from './TrickArea';

function sortHand(hand: readonly CardId[], trump?: string): CardId[] {
  const suitOrder = [...SUITS].sort((a, b) => (a === trump ? -1 : b === trump ? 1 : 0));
  return [...hand].sort((a, b) => {
    const sa = suitOrder.indexOf(suitOf(a));
    const sb = suitOrder.indexOf(suitOf(b));
    if (sa !== sb) return sa - sb;
    return SEQUENCE_ORDER.indexOf(rankOf(a)) - SEQUENCE_ORDER.indexOf(rankOf(b));
  });
}

export function BazarBlotTable({
  view,
  onIntent,
  presence,
  statusChip,
  side,
  onPlayAgain,
  endNote,
  onExit,
  exitCopy,
}: OnlineTableProps<GameView, ActionIntent>) {
  const [error, setError] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [seenRound, setSeenRound] = useState(0);

  const baseSeat = view.viewerSeat ?? 0;
  const seatPositions: [number, number, number, number] = [
    baseSeat,
    (baseSeat + 1) % 4,
    (baseSeat + 2) % 4,
    (baseSeat + 3) % 4,
  ];

  const sendIntent = async (intent: ActionIntent) => {
    setError(null);
    const err = await onIntent(intent);
    if (err) setError(err.message);
  };

  const myHand = useMemo(() => {
    if (view.viewerSeat === null) return [];
    const raw = view.players[view.viewerSeat]?.hand ?? [];
    return sortHand(raw, view.contract?.strain);
  }, [view.viewerSeat, view.players, view.contract?.strain]);

  const legalSet = useMemo(() => new Set(view.legalCards), [view.legalCards]);
  const isMyTurn = view.viewerSeat !== null && view.viewerSeat === view.currentSeat;

  const latestSummary = view.rounds.at(-1) ?? null;
  const showSummary =
    view.status === 'playing' && latestSummary !== null && latestSummary.roundNo > seenRound;

  const winningNames =
    view.result !== null
      ? `${view.players[view.result.winningTeam]?.name} & ${view.players[view.result.winningTeam + 2]?.name}`
      : '';

  return (
    <div
      data-version={view.version}
      className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 py-4"
    >
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-brass">{strings.appName}</h1>
        {statusChip}
        <span
          role="status"
          className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
            isMyTurn ? 'bg-brass text-felt-950' : 'border border-parchment/20 text-parchment/80'
          }`}
        >
          {isMyTurn
            ? strings.table.yourTurn
            : strings.table.waitingTurn(view.players[view.currentSeat]?.name ?? '')}
        </span>
        <Button variant="ghost" onClick={() => setConfirmExit(true)}>
          {exitCopy.confirm}
        </Button>
      </header>

      <ScoreBoard view={view} />

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-gem-ruby/60 bg-gem-ruby/15 px-4 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {view.players.map((p) => {
              const online = presence ? presence.get(p.id) !== false : true;
              const isCurrent = p.seat === view.currentSeat && view.status === 'playing';
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                    isCurrent ? 'border-brass bg-brass/10' : 'border-parchment/15 bg-felt-900/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      aria-hidden="true"
                      className={`size-2 rounded-full ${online ? 'bg-gem-emerald' : 'bg-[#f0a0a8]'}`}
                    />
                    <span className="truncate font-semibold">{p.name}</span>
                    {p.seat === view.dealer && (
                      <span className="rounded bg-parchment/15 px-1 text-[0.65rem]">D</span>
                    )}
                  </div>
                  <span className="text-parchment/65 tabular-nums">{p.handCount}</span>
                </div>
              );
            })}
          </div>

          {view.phase === 'playing' ? (
            <TrickArea view={view} seatPositions={seatPositions} />
          ) : (
            <BiddingPanel view={view} onIntent={(i) => void sendIntent(i)} />
          )}

          {view.combos.announced.length > 0 && (
            <div className="rounded-xl border border-parchment/15 bg-felt-900/50 px-3 py-2 text-xs text-parchment/80">
              <span className="font-semibold text-brass">{strings.table.combosRevealed}: </span>
              {view.combos.announced
                .map(
                  (c) => `${view.players[c.seat]?.name} (${strings.combos[c.kind]} · ${c.points})`,
                )
                .join(', ')}
            </div>
          )}

          {view.combos.blot && (
            <div className="rounded-xl border border-brass/35 bg-brass/10 px-3 py-2 text-xs font-semibold text-brass">
              {strings.table.blotAnnounced(view.players[view.combos.blot.seat]?.name ?? '')}
            </div>
          )}

          {view.viewerSeat !== null && (
            <section aria-label="Your hand" className="flex flex-col gap-2">
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {myHand.map((card) => {
                  const canPlay = view.phase === 'playing' && isMyTurn && legalSet.has(card);
                  return (
                    <PlayingCard
                      key={card}
                      card={card}
                      isTrump={
                        view.contract !== null &&
                        view.contract.strain !== 'BOY' &&
                        card.endsWith(view.contract.strain)
                      }
                      playable={canPlay}
                      disabled={!canPlay}
                      onClick={() => void sendIntent({ type: 'PLAY', card })}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {side && <div className="flex flex-col gap-4">{side}</div>}
      </div>

      <RoundSummaryDialog
        summary={showSummary ? latestSummary : null}
        onClose={() => {
          if (latestSummary) setSeenRound(latestSummary.roundNo);
        }}
      />

      <Dialog open={view.status === 'finished'} onClose={onExit} title={strings.matchEnd.title}>
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-display text-xl text-brass">{strings.matchEnd.winner(winningNames)}</p>
          <p className="text-parchment/80">
            {view.result?.reason === 'reverseKaput'
              ? strings.matchEnd.reverseKaput
              : strings.matchEnd.targetReached}
          </p>
          <p className="tabular-nums">
            {strings.table.teamLabel(0)}: <strong>{view.scores[0]}</strong> ·{' '}
            {strings.table.teamLabel(1)}: <strong>{view.scores[1]}</strong>
          </p>
          {endNote && <p className="text-xs text-parchment/65">{endNote}</p>}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onExit}>
              {strings.matchEnd.exit}
            </Button>
            {onPlayAgain && <Button onClick={onPlayAgain}>{strings.matchEnd.playAgain}</Button>}
          </div>
        </div>
      </Dialog>

      <Dialog open={confirmExit} onClose={() => setConfirmExit(false)} title={exitCopy.title}>
        <p className="text-sm text-parchment/85">{exitCopy.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmExit(false)}>
            Cancel
          </Button>
          <Button onClick={onExit}>{exitCopy.confirm}</Button>
        </div>
      </Dialog>
    </div>
  );
}
