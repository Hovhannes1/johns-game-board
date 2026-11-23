'use client';

import { useMemo, useState } from 'react';
import { SEQUENCE_ORDER, SUITS, rankOf, suitOf } from '@/games/bazar-blot/engine';
import type { ActionIntent, CardId, GameView, PlayerView } from '@/games/bazar-blot/engine';
import { strings } from '@/games/bazar-blot/lib/strings';
import type { OnlineTableProps } from '@/platform/games/table';
import { Button, Dialog } from '@/platform/ui/Dialog';
import { BiddingPanel } from './BiddingPanel';
import { CardBackFan, PlayingCard } from './PlayingCard';
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

function SeatBadge({
  player,
  isDealer,
  isCurrent,
  online,
  orientation = 'horizontal',
}: {
  player: PlayerView;
  isDealer: boolean;
  isCurrent: boolean;
  online: boolean;
  orientation?: 'horizontal' | 'vertical-left' | 'vertical-right';
}) {
  const isVertical = orientation !== 'horizontal';
  const fanOrientation = isVertical ? 'vertical' : 'horizontal';

  return (
    <div className="relative flex items-center justify-center">
      <CardBackFan count={player.handCount} orientation={fanOrientation} />
      <div
        className={`absolute flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-lg backdrop-blur-xs ${
          isVertical ? '[writing-mode:vertical-rl]' : ''
        } ${orientation === 'vertical-left' ? 'rotate-180' : ''} ${
          isCurrent
            ? 'border-brass bg-brass text-felt-950 font-semibold'
            : 'border-parchment/25 bg-felt-950/95 text-parchment'
        }`}
      >
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${online ? 'bg-gem-emerald' : 'bg-[#f0a0a8]'}`}
        />
        <span className="max-w-[6.5rem] truncate">{player.name}</span>
        {isDealer && (
          <span
            title={strings.table.dealer}
            className={`rounded-full px-1.5 text-[0.65rem] font-bold ${
              isCurrent ? 'bg-felt-950/20 text-felt-950' : 'bg-brass/25 text-brass'
            }`}
          >
            D
          </span>
        )}
      </div>
    </div>
  );
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
  const [chatOpen, setChatOpen] = useState(false);

  const baseSeat = view.viewerSeat ?? 0;
  const seatPositions: [number, number, number, number] = [
    baseSeat,
    (baseSeat + 1) % 4,
    (baseSeat + 2) % 4,
    (baseSeat + 3) % 4,
  ];
  const [bottomSeat, leftSeat, topSeat, rightSeat] = seatPositions;

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

  const isOnline = (id: string) => (presence ? presence.get(id) !== false : true);

  return (
    <div
      data-version={view.version}
      className="relative flex min-h-dvh flex-col justify-between overflow-x-hidden bg-felt-950 px-2 py-2 sm:px-4 sm:py-3"
    >
      {/* Top HUD: compact left controls + last trick peek | compact top-right Us vs Them scoreboard */}
      <header className="z-20 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            className="border border-parchment/15 bg-felt-900/80 px-2.5 py-1 text-xs"
            onClick={() => setConfirmExit(true)}
          >
            {exitCopy.confirm}
          </Button>
          <span className="rounded-full border border-parchment/15 bg-felt-900/80 px-2.5 py-1 text-xs text-parchment/85">
            {strings.table.round(view.roundNo)}
          </span>
          {statusChip}
          {view.lastTrick && (
            <div
              title={`${strings.table.lastTrick}: ${view.players[view.lastTrick.winner]?.name}`}
              className="hidden items-center gap-1 rounded-xl border border-parchment/15 bg-felt-900/75 px-2 py-1 sm:flex"
            >
              {view.lastTrick.plays.map((p) => (
                <PlayingCard key={p.card} card={p.card} size="xs" />
              ))}
            </div>
          )}
        </div>

        <ScoreBoard view={view} />
      </header>

      {error && (
        <p
          role="alert"
          className="mx-auto my-1 rounded-lg border border-gem-ruby/60 bg-gem-ruby/15 px-3 py-1 text-xs"
        >
          {error}
        </p>
      )}

      {/* Main Felt Table Arena */}
      <div className="relative mx-auto my-4 flex w-full max-w-5xl flex-1 items-center justify-center px-3 sm:px-6">
        <div className="relative flex min-h-[24rem] w-full flex-col items-center justify-center rounded-[2.5rem] border-[6px] border-[#6b4423] bg-[radial-gradient(ellipse_at_center,#1f5c3a_0%,#133b25_70%,#0d291a_100%)] px-8 py-10 shadow-[inset_0_0_50px_rgba(0,0,0,0.55),0_16px_40px_rgba(0,0,0,0.55)] ring-2 ring-brass/35 sm:min-h-[30rem] sm:rounded-[6rem] sm:border-[10px] sm:px-14 sm:py-12">
          {/* Top seat (Partner) straddling top border */}
          <div className="absolute -top-6 left-1/2 z-20 -translate-x-1/2 sm:-top-8">
            <SeatBadge
              player={view.players[topSeat]!}
              isDealer={topSeat === view.dealer}
              isCurrent={topSeat === view.currentSeat && view.status === 'playing'}
              online={isOnline(view.players[topSeat]!.id)}
            />
          </div>

          {/* Left seat straddling left border */}
          <div className="absolute top-1/2 -left-5 z-20 -translate-y-1/2 sm:-left-8">
            <SeatBadge
              player={view.players[leftSeat]!}
              isDealer={leftSeat === view.dealer}
              isCurrent={leftSeat === view.currentSeat && view.status === 'playing'}
              online={isOnline(view.players[leftSeat]!.id)}
              orientation="vertical-left"
            />
          </div>

          {/* Right seat straddling right border */}
          <div className="absolute top-1/2 -right-5 z-20 -translate-y-1/2 sm:-right-8">
            <SeatBadge
              player={view.players[rightSeat]!}
              isDealer={rightSeat === view.dealer}
              isCurrent={rightSeat === view.currentSeat && view.status === 'playing'}
              online={isOnline(view.players[rightSeat]!.id)}
              orientation="vertical-right"
            />
          </div>

          {/* Center Trick or Bidding */}
          <div className="z-10 flex w-full flex-col items-center justify-center gap-2">
            {view.phase === 'playing' ? (
              <TrickArea view={view} seatPositions={seatPositions} />
            ) : (
              <BiddingPanel view={view} onIntent={(i) => void sendIntent(i)} />
            )}

            {view.combos.revealed && view.combos.revealed.length > 0 && (
              <div
                aria-label={strings.table.combosRevealed}
                className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-brass/45 bg-felt-950/85 px-2.5 py-1.5 shadow-lg"
              >
                {view.combos.revealed.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5">
                    <span className="text-[0.7rem] font-semibold text-brass">
                      {view.players[c.seat]?.name} ({strings.combos[c.kind]}):
                    </span>
                    <div className="flex">
                      {c.cards.map((card, idx) => (
                        <PlayingCard
                          key={card}
                          card={card}
                          size="xs"
                          className={idx > 0 ? '-ml-1.5' : ''}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(!view.combos.revealed || view.combos.revealed.length === 0) &&
              view.combos.announced.length > 0 && (
                <div className="rounded-full border border-parchment/15 bg-felt-950/75 px-3 py-0.5 text-[0.7rem] text-parchment/85">
                  <span className="font-semibold text-brass">{strings.table.combosRevealed}: </span>
                  {view.combos.announced
                    .map((c) => `${view.players[c.seat]?.name} (${strings.combos[c.kind]})`)
                    .join(', ')}
                </div>
              )}

            {view.combos.blot && (
              <div className="rounded-full border border-brass/40 bg-brass/15 px-3 py-0.5 text-[0.7rem] font-semibold text-brass">
                {strings.table.blotAnnounced(view.players[view.combos.blot.seat]?.name ?? '')}
              </div>
            )}
          </div>

          {/* Bottom status indicator + Bonus button */}
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
            <span
              role="status"
              className={`rounded-full px-3 py-0.5 text-xs font-semibold shadow ${
                isMyTurn
                  ? 'bg-brass text-felt-950'
                  : 'border border-parchment/20 bg-felt-950/80 text-parchment/80'
              }`}
            >
              {isMyTurn
                ? strings.table.yourTurn
                : strings.table.waitingTurn(view.players[view.currentSeat]?.name ?? '')}
            </span>
            {bottomSeat === view.dealer && (
              <span className="rounded-full bg-brass/25 px-2 py-0.5 text-[0.65rem] font-bold text-brass">
                D
              </span>
            )}
            {view.combos.canDeclareBonus && (
              <button
                type="button"
                onClick={() => void sendIntent({ type: 'DECLARE_BONUS' })}
                className="cursor-pointer rounded-full border border-brass bg-brass px-3 py-0.5 text-xs font-bold text-felt-950 shadow-md transition-transform hover:scale-105"
              >
                {strings.table.bonus}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Hand */}
      {view.viewerSeat !== null && (
        <section
          aria-label="Your hand"
          className="z-20 mx-auto flex max-w-full items-end justify-center pb-1 pt-2"
        >
          <div className="flex items-end justify-center">
            {myHand.map((card, i) => {
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
                  className={i > 0 ? '-ml-3 sm:-ml-6' : ''}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Floating Collapsible Chat */}
      {side && (
        <div className="fixed right-3 bottom-3 z-40 flex flex-col items-end gap-2 sm:right-4 sm:bottom-4">
          {chatOpen && (
            <div className="w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-brass/35 bg-felt-950/95 p-3 shadow-2xl backdrop-blur-sm">
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  aria-label={strings.table.chatClose}
                  onClick={() => setChatOpen(false)}
                  className="rounded-md px-2 py-0.5 text-xs text-parchment/70 hover:bg-white/10 hover:text-parchment"
                >
                  ✕
                </button>
              </div>
              {side}
            </div>
          )}
          <button
            type="button"
            aria-label={chatOpen ? strings.table.chatClose : strings.table.chatOpen}
            aria-expanded={chatOpen}
            onClick={() => setChatOpen((o) => !o)}
            className="flex size-11 items-center justify-center rounded-full border border-brass/50 bg-felt-900/95 text-brass shadow-lg transition-transform hover:scale-105 hover:bg-felt-900"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-5"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      )}

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
