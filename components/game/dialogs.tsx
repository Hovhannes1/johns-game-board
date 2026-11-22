'use client';

import { useState } from 'react';
import { computePayment, explainIntentForViewer, sumCounts, TOKEN_COLORS } from '@/engine';
import type { ActionIntent, CardDef, GameView, Level, RuleError, TokenColor } from '@/engine';
import { CardBack, CardFace } from '@/components/art/CardArt';
import { NobleTile } from '@/components/art/NobleArt';
import { TokenChip } from '@/components/art/TokenChip';
import { Button, Dialog } from '@/components/ui/Dialog';
import { cardTitle, costText, requirementText, tokenList } from '@/lib/format';
import { joinList, strings } from '@/lib/strings';
import { usePreferences } from '@/stores/preferences';
import type { ArtStyle } from '@/stores/preferences';
import { GemIcon } from '@/components/art/GemIcon';
import { cardTile, chipTile, spriteStyle } from '@/components/art/sprites';

type Submit = (intent: ActionIntent) => Promise<RuleError | null>;

function viewerOf(view: GameView) {
  return view.players.find((p) => p.id === view.viewerId) ?? null;
}

function TokenRow({ tokens }: { tokens: Partial<Record<TokenColor, number>> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {TOKEN_COLORS.filter((c) => (tokens[c] ?? 0) > 0).map((c) => (
        <span key={c} className="inline-flex items-center gap-1">
          <TokenChip color={c} size="xs" />
          <span className="tabular-nums">{tokens[c]}</span>
        </span>
      ))}
    </span>
  );
}

function Problem({ error }: { error: RuleError | null }) {
  if (!error) return null;
  return <p className="mt-1 text-sm text-[#f0a0a8]">{error.message}</p>;
}

// ---------------------------------------------------------------------------

interface CardActionDialogProps {
  view: GameView;
  card: CardDef;
  source: 'market' | 'reserved';
  onSubmit: Submit;
  onClose: () => void;
}

/** Buy or reserve a card, with the exact payment shown before confirming (FR-11). */
export function CardActionDialog({ view, card, source, onSubmit, onClose }: CardActionDialogProps) {
  const viewer = viewerOf(view);
  const buyIntent: ActionIntent =
    source === 'market'
      ? { type: 'BUY_FACE_UP', cardId: card.id }
      : { type: 'BUY_RESERVED', cardId: card.id };
  const buyProblem = explainIntentForViewer(view, buyIntent);
  const plan = viewer ? computePayment(card.cost, viewer.bonuses, viewer.tokens) : null;
  const reserveIntent: ActionIntent = { type: 'RESERVE_FACE_UP', cardId: card.id };
  const reserveProblem = source === 'market' ? explainIntentForViewer(view, reserveIntent) : null;

  const run = async (intent: ActionIntent) => {
    if (!(await onSubmit(intent))) onClose();
  };

  return (
    <Dialog open title={cardTitle(card)} onClose={onClose}>
      <div className="flex flex-col gap-5 sm:flex-row">
        <CardFace card={card} scale="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-4 text-sm">
          <p className="text-parchment/80">
            {card.points} {strings.table.prestige} · {costText(card.cost)}
          </p>
          <div>
            {!buyProblem && plan && (
              <p className="mb-2">
                {sumCounts(plan.payment) === 0 ? (
                  strings.card.free
                ) : (
                  <>
                    <span className="mr-2 text-parchment/70">{strings.card.youPay}</span>
                    <span className="sr-only">{tokenList(plan.payment)}</span>
                    <span aria-hidden="true">
                      <TokenRow tokens={plan.payment} />
                    </span>
                  </>
                )}
              </p>
            )}
            <Button onClick={() => void run(buyIntent)} disabledReason={buyProblem?.message}>
              {strings.card.buy}
            </Button>
            <Problem error={buyProblem} />
          </div>
          {source === 'market' && (
            <div>
              {!reserveProblem && (
                <p className="mb-2 text-parchment/70">
                  {view.supply.gold > 0 ? strings.card.reserveGold : strings.card.reserveNoGold}
                </p>
              )}
              <Button
                variant="secondary"
                onClick={() => void run(reserveIntent)}
                disabledReason={reserveProblem?.message}
              >
                {strings.card.reserve}
              </Button>
              <Problem error={reserveProblem} />
            </div>
          )}
          <div className="mt-auto">
            <Button variant="ghost" onClick={onClose}>
              {strings.card.close}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

interface DeckDialogProps {
  view: GameView;
  level: Level;
  onSubmit: Submit;
  onClose: () => void;
}

export function DeckReserveDialog({ view, level, onSubmit, onClose }: DeckDialogProps) {
  const intent: ActionIntent = { type: 'RESERVE_FROM_DECK', level };
  const problem = explainIntentForViewer(view, intent);
  return (
    <Dialog open title={strings.card.deckReserveTitle(level)} onClose={onClose}>
      <div className="flex gap-5">
        <CardBack level={level} scale="lg" count={view.deckCounts[level]} />
        <div className="flex flex-col gap-3 text-sm">
          <p>{strings.card.deckReserveBody}</p>
          <p className="text-parchment/70">
            {view.supply.gold > 0 ? strings.card.reserveGold : strings.card.reserveNoGold}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => void onSubmit(intent).then((e) => !e && onClose())}
              disabledReason={problem?.message}
            >
              {strings.card.reserve}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {strings.card.close}
            </Button>
          </div>
          <Problem error={problem} />
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

/** Mandatory: pick exactly the excess tokens to hand back (FR-11). */
export function ReturnTokensDialog({ view, onSubmit }: { view: GameView; onSubmit: Submit }) {
  const viewer = viewerOf(view);
  const [picked, setPicked] = useState<Partial<Record<TokenColor, number>>>({});
  if (!viewer || view.phase.kind !== 'returnTokens') return null;
  const count = view.phase.count;
  const chosen = sumCounts(picked);
  const intent: ActionIntent = { type: 'RETURN_TOKENS', tokens: picked };
  const problem = explainIntentForViewer(view, intent);

  const change = (color: TokenColor, delta: number) =>
    setPicked((prev) => ({ ...prev, [color]: Math.max(0, (prev[color] ?? 0) + delta) }));

  return (
    <Dialog open title={strings.returnTokens.title}>
      <p className="mb-4 text-sm">{strings.returnTokens.body(count)}</p>
      <ul className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {TOKEN_COLORS.filter((c) => viewer.tokens[c] > 0).map((color) => {
          const n = picked[color] ?? 0;
          const canAdd = n < viewer.tokens[color] && chosen < count;
          return (
            <li key={color} className="flex flex-col items-center gap-1">
              <button
                type="button"
                aria-label={strings.returnTokens.add(strings.gems[color], viewer.tokens[color] - n)}
                aria-disabled={!canAdd || undefined}
                onClick={canAdd ? () => change(color, 1) : undefined}
                className="rounded-full"
              >
                <TokenChip color={color} count={viewer.tokens[color] - n} dimmed={!canAdd} />
              </button>
              {n > 0 && (
                <button
                  type="button"
                  onClick={() => change(color, -1)}
                  aria-label={strings.tokens.removeSelected(strings.gems[color])}
                  className="rounded bg-felt-800 px-2 text-xs text-parchment underline"
                >
                  −{n}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p role="status" className="mb-3 text-sm text-parchment/80">
        {strings.returnTokens.chosen(chosen, count)}
      </p>
      <Button onClick={() => void onSubmit(intent)} disabledReason={problem?.message}>
        {strings.returnTokens.confirm}
      </Button>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function ChooseNobleDialog({ view, onSubmit }: { view: GameView; onSubmit: Submit }) {
  if (view.phase.kind !== 'chooseNoble') return null;
  const options = view.phase.options
    .map((id) => view.nobles.find((n) => n.id === id))
    .filter((n) => n !== undefined);
  return (
    <Dialog open title={strings.nobles.title}>
      <p className="mb-4 text-sm">{strings.nobles.body}</p>
      <ul className="flex flex-wrap gap-4">
        {options.map((noble) => (
          <li key={noble.id}>
            <button
              type="button"
              onClick={() => void onSubmit({ type: 'CHOOSE_NOBLE', nobleId: noble.id })}
              aria-label={`${strings.nobles.choose(noble.name)}. ${strings.nobles.describe(noble.name, requirementText(noble.requires))}`}
              className="flex flex-col items-center gap-2 rounded-lg p-2 hover:bg-white/5"
            >
              <NobleTile noble={noble} scale="sm" />
              <span className="max-w-[8rem] text-center font-display text-sm">{noble.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

interface EndGameDialogProps {
  view: GameView;
  onPlayAgain?: () => void;
  onNewGame?: () => void;
  onViewBoard: () => void;
  /** Shown above the buttons, e.g. "Waiting for the host". */
  note?: string;
}

/** Final scores, tie-break explanation and turn statistics (FR-12). */
export function EndGameDialog({
  view,
  onPlayAgain,
  onNewGame,
  onViewBoard,
  note,
}: EndGameDialogProps) {
  const result = view.result;
  if (!result) return null;
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const top = result.standings[0]!;
  const winners = result.winners.map(name);

  const gemsTaken = new Map<string, number>();
  for (const entry of view.log) {
    for (const e of entry.events) {
      if (e.type === 'TOKENS_TAKEN')
        gemsTaken.set(e.playerId, (gemsTaken.get(e.playerId) ?? 0) + sumCounts(e.tokens));
    }
  }

  const headline =
    result.tieBreak === 'shared'
      ? strings.endGame.shared(joinList(winners), top.points)
      : result.tieBreak === 'fewestCards'
        ? strings.endGame.fewestCards(winners[0]!, top.points, top.purchasedCount)
        : strings.endGame.winner(winners[0]!, top.points);

  return (
    <Dialog open title={strings.endGame.title} className="w-[min(40rem,94vw)]">
      {result.reason === 'stalemate' && (
        <p className="mb-2 text-sm text-parchment/80">{strings.endGame.stalemate}</p>
      )}
      <p className="mb-4 font-display text-xl">{headline}</p>
      <div className="mb-3 overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-parchment/60">
            <tr>
              <th scope="col" className="py-1 pr-3">
                {strings.endGame.rank}
              </th>
              <th scope="col" className="py-1 pr-3">
                {strings.endGame.player}
              </th>
              <th scope="col" className="py-1 pr-3">
                {strings.endGame.prestige}
              </th>
              <th scope="col" className="py-1 pr-3">
                {strings.endGame.cards}
              </th>
              <th scope="col" className="py-1 pr-3">
                {strings.endGame.nobles}
              </th>
              <th scope="col" className="py-1 pr-3">
                {strings.endGame.turns}
              </th>
              <th scope="col" className="py-1">
                {strings.endGame.gemsTaken}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.standings.map((s) => {
              const p = byId.get(s.playerId);
              return (
                <tr key={s.playerId} className={s.rank === 1 ? 'text-brass' : ''}>
                  <td className="py-1 pr-3">{s.rank}</td>
                  <th scope="row" className="py-1 pr-3 font-semibold">
                    {name(s.playerId)}
                  </th>
                  <td className="py-1 pr-3">{s.points}</td>
                  <td className="py-1 pr-3">{s.purchasedCount}</td>
                  <td className="py-1 pr-3">{p?.nobles.length ?? 0}</td>
                  <td className="py-1 pr-3">{p?.turnsTaken ?? 0}</td>
                  <td className="py-1">{gemsTaken.get(s.playerId) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mb-5 text-sm text-parchment/70">{strings.endGame.rounds(view.round)}</p>
      {note && <p className="mb-4 text-sm text-parchment/85">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {onPlayAgain && <Button onClick={onPlayAgain}>{strings.endGame.playAgain}</Button>}
        {onNewGame && (
          <Button variant="secondary" onClick={onNewGame}>
            {strings.endGame.newGame}
          </Button>
        )}
        <Button variant="ghost" onClick={onViewBoard}>
          {strings.endGame.viewBoard}
        </Button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      title={strings.rules.title}
      onClose={onClose}
      className="w-[min(42rem,94vw)]"
    >
      <div className="flex flex-col gap-4 text-sm leading-relaxed">
        {strings.rules.sections.map((s) => (
          <section key={s.heading}>
            <h3 className="mb-1 font-display text-lg text-parchment">{s.heading}</h3>
            <p className="text-parchment/85">{s.body}</p>
          </section>
        ))}
      </div>
      <div className="mt-5">
        <Button variant="secondary" onClick={onClose}>
          {strings.rules.close}
        </Button>
      </div>
    </Dialog>
  );
}

/** A small sample of each art style, independent of the current setting. */
function ArtPreview({ style }: { style: ArtStyle }) {
  if (style === 'images') {
    return (
      <span aria-hidden="true" className="flex items-center gap-1">
        <span
          className="block h-[2.8rem] w-8 rounded-[3px] shadow"
          style={spriteStyle('cards', cardTile('emerald', 2))}
        />
        <span
          className="block size-6 rounded-full"
          style={spriteStyle('chips', chipTile('ruby'), 0.04)}
        />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      <span className="block h-[2.8rem] w-8 overflow-hidden rounded-[3px] shadow">
        <svg viewBox="0 0 32 45" className="size-full">
          <rect width="32" height="45" fill="#2e8a5f" />
          <rect width="32" height="10" fill="rgba(255,255,255,0.2)" />
        </svg>
      </span>
      <GemIcon color="ruby" size="1.5rem" />
    </span>
  );
}

/** Sound, motion and artwork preferences (3.7), stored in this browser. */
export function PreferencesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sound, motion, art, setSound, setMotion, setArt } = usePreferences();
  const t = strings.preferences;
  return (
    <Dialog open={open} title={t.title} onClose={onClose}>
      <div className="flex flex-col gap-5 text-sm">
        <fieldset>
          <legend className="mb-2 font-semibold">{t.art}</legend>
          <div className="flex flex-wrap gap-3">
            {(
              [
                ['vector', t.artVector],
                ['images', t.artImages],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brass ${art === value ? 'border-brass bg-brass/15' : 'border-parchment/20'}`}
              >
                <input
                  type="radio"
                  name="art"
                  checked={art === value}
                  onChange={() => setArt(value)}
                  className="sr-only"
                />
                <ArtPreview style={value} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          {t.sound}
        </label>
        <fieldset>
          <legend className="mb-2 font-semibold">{t.motion}</legend>
          <div className="flex flex-col gap-1.5">
            {(
              [
                ['system', t.motionSystem],
                ['reduce', t.motionReduce],
                ['full', t.motionFull],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="motion"
                  checked={motion === value}
                  onChange={() => setMotion(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <Button variant="secondary" onClick={onClose}>
            {t.close}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <p className="mb-5 text-sm">{body}</p>
      <div className="flex gap-2">
        <Button onClick={onConfirm}>{confirmLabel}</Button>
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Dialog>
  );
}
