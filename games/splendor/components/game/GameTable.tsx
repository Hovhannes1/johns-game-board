'use client';

import { LayoutGroup, MotionConfig } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { explainIntentForViewer, legalIntentsForViewer } from '@/games/splendor/engine';
import type {
  ActionIntent,
  CardDef,
  GameView,
  GemColor,
  Level,
  RuleError,
} from '@/games/splendor/engine';
import { SEAT_COLORS } from '@/games/splendor/components/art/palette';
import { Button } from '@/platform/ui/Dialog';
import { addGem, removeGem, selectionToIntent } from '@/games/splendor/lib/selection';
import type { GemSelection } from '@/games/splendor/lib/selection';
import { online, strings } from '@/games/splendor/lib/strings';
import { useArtStyle, usePreferences, useReducedMotion } from '@/games/splendor/stores/preferences';
import { Bank, SelectionTray } from './Bank';
import {
  CardActionDialog,
  ChooseNobleDialog,
  ConfirmDialog,
  DeckReserveDialog,
  EndGameDialog,
  PreferencesDialog,
  ReturnTokensDialog,
  RulesDialog,
} from './dialogs';
import { GameLog } from './GameLog';
import { Market, NobleRow } from './Market';
import { PlayerArea } from './PlayerArea';
import { TableEffects } from './TableEffects';

export interface GameTableProps {
  view: GameView;
  /** Sends an intent to whoever is authoritative (local engine or server). */
  onIntent: (
    intent: ActionIntent,
  ) => { code: string; message: string } | null | Promise<{ code: string; message: string } | null>;
  onPlayAgain?: () => void;
  onNewGame?: () => void;
  onExit?: () => void;
  /** Online: who is connected right now, by player id. */
  presence?: ReadonlyMap<string, boolean>;
  /** Online: epoch ms when the current turn is auto-played, in server time. */
  turnDeadline?: number | null;
  /** serverNow - Date.now(), to show countdowns in server time. */
  clockOffset?: number;
  /** Extra content for the side column (online chat). */
  side?: ReactNode;
  /** Text on the end screen when this viewer cannot start the next game. */
  endNote?: string;
  /** Overrides the leave-confirmation copy (online seats are kept). */
  exitCopy?: { title: string; body: string; confirm: string };
  /** Status chip next to the round counter (connection state). */
  statusChip?: ReactNode;
}

/** Interaction state tied to a game version, so it resets whenever the game moves on. */
interface Versioned<T> {
  version: number;
  value: T;
}

/**
 * The full table: nobles, market, bank, player areas, log and the guided
 * action flows. Renders any player's redacted view, so the same component
 * serves hot-seat play now and online play later.
 */
export function GameTable({
  view,
  onIntent,
  onPlayAgain,
  onNewGame,
  onExit,
  presence,
  turnDeadline = null,
  clockOffset = 0,
  side,
  endNote,
  exitCopy,
  statusChip,
}: GameTableProps) {
  const [selection, setSelection] = useState<Versioned<GemSelection>>({
    version: view.version,
    value: [],
  });
  const [cardChoice, setCardChoice] = useState<Versioned<{
    card: CardDef;
    source: 'market' | 'reserved';
  }> | null>(null);
  const [deckChoice, setDeckChoice] = useState<Versioned<Level> | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [error, setError] = useState<Versioned<string> | null>(null);
  const reducedMotion = useReducedMotion();
  const sound = usePreferences((s) => s.sound);
  const art = useArtStyle();

  const current = (v: { version: number } | null) => v !== null && v.version === view.version;
  const gems = current(selection) ? selection.value : [];

  const legal = useMemo(() => legalIntentsForViewer(view), [view]);
  const buyable = useMemo(
    () =>
      new Set(
        legal.flatMap((i) =>
          i.type === 'BUY_FACE_UP' || i.type === 'BUY_RESERVED' ? [i.cardId] : [],
        ),
      ),
    [legal],
  );

  const viewer = view.players.find((p) => p.id === view.viewerId) ?? null;
  const currentPlayer = view.players.find((p) => p.id === view.currentPlayerId)!;
  const canAct = view.status === 'playing' && viewer !== null && viewer.id === view.currentPlayerId;
  const actionPhase = canAct && view.phase.kind === 'action';
  const onlyPass = actionPhase && legal.length === 1 && legal[0]!.type === 'PASS';

  const submit = async (intent: ActionIntent): Promise<RuleError | null> => {
    const problem = await onIntent(intent);
    // Errors are tagged with the version they happened in and vanish once the game moves on.
    setError(
      problem ? { version: view.version, value: strings.table.rejected(problem.message) } : null,
    );
    return problem as RuleError | null;
  };

  const intent = selectionToIntent(gems);
  const selectionProblem = intent ? explainIntentForViewer(view, intent) : null;

  const setGems = (value: GemSelection) => setSelection({ version: view.version, value });

  // Seat order starting from the viewer (or the current player for spectators), clockwise.
  const anchor = view.players.findIndex((p) => p.id === (viewer?.id ?? view.currentPlayerId));
  const ordered = view.players.map((_, i) => view.players[(anchor + i) % view.players.length]!);
  const [focus, ...others] = ordered;

  const phaseText =
    view.status === 'finished'
      ? strings.endGame.title
      : !canAct
        ? strings.table.phase.waiting(currentPlayer.name)
        : view.phase.kind === 'returnTokens'
          ? strings.table.phase.returnTokens(view.phase.count)
          : view.phase.kind === 'chooseNoble'
            ? strings.table.phase.chooseNoble
            : strings.table.phase.action;

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      {/* Layout ids are scoped to whose seat the screen is anchored on, so hot-seat
        turn changes re-arrange the table without sending every card flying. */}
      <LayoutGroup id={`seat-${focus?.id ?? 'none'}`}>
        {/* data-version lets end-to-end tests wait for each move to land. */}
        <div className="mx-auto max-w-[112rem] px-3 pb-8 sm:px-5" data-version={view.version}>
          <a
            href="#board"
            className="sr-only rounded-md bg-brass px-3 py-2 text-felt-950 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
          >
            {strings.table.skipToBoard}
          </a>
          <TableEffects
            log={view.log}
            animations={!reducedMotion}
            sounds={sound}
            myTurn={canAct}
            art={art}
          />
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <h1 className="font-display text-2xl font-semibold text-brass">{strings.appName}</h1>
            <span className="text-sm text-parchment/70">{strings.table.round(view.round)}</span>
            {statusChip}
            {view.finalRound && view.status === 'playing' && (
              <span className="rounded-full bg-gem-ruby px-2.5 py-0.5 text-xs font-semibold text-white">
                {strings.table.finalRound}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              {view.status === 'finished' && resultsHidden && (
                <Button variant="secondary" onClick={() => setResultsHidden(false)}>
                  {strings.table.showResults}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setRulesOpen(true)}>
                {strings.table.rules}
              </Button>
              <Button variant="ghost" onClick={() => setPrefsOpen(true)}>
                {strings.table.settings}
              </Button>
              {onExit && (
                <Button variant="ghost" onClick={() => setExitOpen(true)}>
                  {strings.table.exit}
                </Button>
              )}
            </div>
          </header>

          <div
            role="status"
            aria-live="polite"
            className="mb-3 flex flex-wrap items-baseline gap-x-3 rounded-lg border border-parchment/10 bg-felt-900/80 px-4 py-2"
          >
            {view.status === 'playing' && (
              <span
                className="font-display text-xl"
                style={{ color: SEAT_COLORS[currentPlayer.seat] }}
              >
                {strings.table.turnOf(currentPlayer.name)}
              </span>
            )}
            <span className="text-sm text-parchment/80">{phaseText}</span>
            {view.status === 'playing' && turnDeadline !== null && (
              <TurnCountdown deadline={turnDeadline} clockOffset={clockOffset} />
            )}
          </div>

          {current(error) && (
            <p
              role="alert"
              className="mb-3 rounded-lg border border-gem-ruby/60 bg-gem-ruby/15 px-4 py-2 text-sm"
            >
              {error!.value}
            </p>
          )}

          <div className="table-layout">
            <div
              id="board"
              tabIndex={-1}
              className="flex min-w-0 flex-col gap-4 outline-none"
              style={{ gridArea: 'board' }}
            >
              <NobleRow nobles={view.nobles} />
              <Market
                view={view}
                buyable={buyable}
                canAct={canAct}
                onCard={(card) =>
                  setCardChoice({ version: view.version, value: { card, source: 'market' } })
                }
                onDeck={(level) => setDeckChoice({ version: view.version, value: level })}
              />
              <div className="table-tray">
                <Bank
                  view={view}
                  selection={gems}
                  canAct={actionPhase && !onlyPass}
                  onAdd={(color) => setGems(addGem(gems, color))}
                />
              </div>
              <div className="table-tray">
                {actionPhase && !onlyPass && (
                  <SelectionTray
                    selection={gems}
                    intent={intent}
                    problem={selectionProblem}
                    onRemove={(color: GemColor) => setGems(removeGem(gems, color))}
                    onClear={() => setGems([])}
                    // A successful take bumps the version, which clears the selection by itself.
                    onConfirm={() => intent && void submit(intent)}
                  />
                )}
                {onlyPass && (
                  <div className="flex items-center gap-3 rounded-lg border border-brass/50 px-4 py-3">
                    <p className="text-sm">{strings.pass.body}</p>
                    <Button onClick={() => void submit({ type: 'PASS' })}>
                      {strings.pass.label}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Chat matters more mid-game than the move history, so it comes first. */}
            <div className="table-side" style={{ gridArea: 'side' }}>
              {side}
              <GameLog view={view} />
            </div>

            <div
              className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-1"
              style={{ gridArea: 'players' }}
            >
              {focus && (
                <div className="md:col-span-2 xl:col-span-1">
                  <PlayerArea
                    player={focus}
                    rules={view.rules}
                    seatColor={SEAT_COLORS[focus.seat]!}
                    isCurrent={focus.id === view.currentPlayerId && view.status === 'playing'}
                    isViewer={focus.id === view.viewerId}
                    isStart={focus.id === view.startPlayerId}
                    offline={presence?.get(focus.id) === false}
                    buyableReserved={canAct ? buyable : new Set()}
                    onReserved={(card) =>
                      setCardChoice({ version: view.version, value: { card, source: 'reserved' } })
                    }
                  />
                </div>
              )}
              {others.map((p) => (
                <PlayerArea
                  key={p.id}
                  player={p}
                  rules={view.rules}
                  seatColor={SEAT_COLORS[p.seat]!}
                  isCurrent={p.id === view.currentPlayerId && view.status === 'playing'}
                  isViewer={false}
                  isStart={p.id === view.startPlayerId}
                  offline={presence?.get(p.id) === false}
                  compact
                  collapsible
                  buyableReserved={new Set()}
                />
              ))}
            </div>
          </div>

          {current(cardChoice) && (
            <CardActionDialog
              view={view}
              card={cardChoice!.value.card}
              source={cardChoice!.value.source}
              onSubmit={submit}
              onClose={() => setCardChoice(null)}
            />
          )}
          {current(deckChoice) && (
            <DeckReserveDialog
              view={view}
              level={deckChoice!.value}
              onSubmit={submit}
              onClose={() => setDeckChoice(null)}
            />
          )}
          {canAct && view.phase.kind === 'returnTokens' && (
            <ReturnTokensDialog key={view.version} view={view} onSubmit={submit} />
          )}
          {canAct && view.phase.kind === 'chooseNoble' && (
            <ChooseNobleDialog key={view.version} view={view} onSubmit={submit} />
          )}
          {view.status === 'finished' && !resultsHidden && (
            <EndGameDialog
              view={view}
              onPlayAgain={onPlayAgain}
              onNewGame={onNewGame}
              onViewBoard={() => setResultsHidden(true)}
              note={endNote}
            />
          )}
          <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
          <PreferencesDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
          {onExit && (
            <ConfirmDialog
              open={exitOpen}
              title={exitCopy?.title ?? strings.exitConfirm.title}
              body={exitCopy?.body ?? strings.exitConfirm.body}
              confirmLabel={exitCopy?.confirm ?? strings.exitConfirm.confirm}
              cancelLabel={strings.exitConfirm.cancel}
              onConfirm={() => {
                setExitOpen(false);
                onExit();
              }}
              onCancel={() => setExitOpen(false)}
            />
          )}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}

/** Seconds left before the server plays a move for the current player (3.7). */
function TurnCountdown({ deadline, clockOffset }: { deadline: number; clockOffset: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((deadline - (now + clockOffset)) / 1000));
  return (
    <span
      className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${seconds <= 10 ? 'bg-gem-ruby text-white' : 'bg-felt-800 text-parchment/85'}`}
    >
      {online.table.timeLeft(seconds)}
    </span>
  );
}
