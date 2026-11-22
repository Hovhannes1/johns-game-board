'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { GEM_COLORS } from '@/games/splendor/engine';
import type { CardDef, GemColor, PlayerView, RuleSet } from '@/games/splendor/engine';
import { CardBack, CardFace } from '@/games/splendor/components/art/CardArt';
import type { CardScale } from '@/games/splendor/components/art/CardArt';
import { CARD_SCALES } from '@/games/splendor/components/art/CardArt';
import { GemIcon } from '@/games/splendor/components/art/GemIcon';
import { NobleTile } from '@/games/splendor/components/art/NobleArt';
import { TokenChip } from '@/games/splendor/components/art/TokenChip';
import { describeCard, requirementText, tokenList } from '@/games/splendor/lib/format';
import { online, strings } from '@/games/splendor/lib/strings';

interface PlayerAreaProps {
  player: PlayerView;
  rules: RuleSet;
  seatColor: string;
  isCurrent: boolean;
  isViewer: boolean;
  isStart: boolean;
  /** Opponents use a smaller scale; the viewer's own tableau is larger. */
  compact?: boolean;
  /** Online: the player's browser is not connected. */
  offline?: boolean;
  /** On phones, show a one-line summary until expanded (4.3 mobile layout). */
  collapsible?: boolean;
  /** Reserved card ids the viewer could buy right now. */
  buyableReserved: ReadonlySet<string>;
  onReserved?: (card: CardDef) => void;
}

const sectionLabel = 'mb-[0.5em] text-[0.65rem] tracking-[0.18em] text-parchment/55 uppercase';

/** Overlap so only each card's top band (points and bonus) shows, except the last. */
const STACK_STEP = '-7.4em';

/**
 * One color of a player's resources: token chip on top, the cards of that
 * bonus stacked beneath, so "tokens + bonuses" reads at a glance.
 */
function ColorColumn({
  color,
  tokens,
  cards,
  scale,
  showStack,
  anchor,
}: {
  color: GemColor;
  tokens: number;
  cards: CardDef[];
  scale: CardScale;
  showStack: boolean;
  /** Landing spot for flying tokens (TableEffects). */
  anchor: string;
}) {
  const label = `${strings.gems[color]}: ${tokens} ${tokens === 1 ? 'token' : 'tokens'}, ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`;
  return (
    <li aria-label={label} className="flex w-[7em] flex-col items-center gap-[0.6em]">
      <span data-anchor={anchor}>
        <TokenChip color={color} size="fluid" count={tokens} dimmed={tokens === 0} />
      </span>
      {!showStack ? (
        <span
          className="flex items-center gap-[0.3em] text-[max(11px,1.6em)] tabular-nums"
          aria-hidden="true"
        >
          <GemIcon color={color} size="1em" />
          {cards.length}
        </span>
      ) : cards.length === 0 ? (
        <span
          aria-hidden="true"
          className="grid h-[3.2em] w-[7em] place-items-center rounded-[0.55em] border border-dashed border-parchment/15"
        >
          <GemIcon color={color} size="1.6em" className="opacity-35" />
        </span>
      ) : (
        <ol className="flex flex-col" aria-hidden="true">
          {cards.map((card, i) => (
            <motion.li
              key={card.id}
              layoutId={`card-${card.id}`}
              transition={{ layout: { duration: 0.42, ease: 'easeInOut' } }}
              title={describeCard(card)}
              style={{ marginTop: i === 0 ? 0 : STACK_STEP }}
            >
              <CardFace card={card} scale={scale} />
            </motion.li>
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * One player's tableau (FR-8). Each gem color is a column (token chip over
 * the stacked cards of that bonus), with gold, reserved cards and nobles
 * beside it. Everything is sized from one font-size, so the viewer's own
 * tableau is drawn larger than opponents'.
 */
export function PlayerArea({
  player,
  rules,
  seatColor,
  isCurrent,
  isViewer,
  isStart,
  compact = false,
  offline = false,
  collapsible = false,
  buyableReserved,
  onReserved,
}: PlayerAreaProps) {
  const [expanded, setExpanded] = useState(false);
  const scale: CardScale = compact ? 'theirs' : 'mine';
  // Collapsing only applies on small screens; md+ always shows everything.
  const collapsed = collapsible && !expanded;
  const byColor = GEM_COLORS.map((color) => ({
    color,
    cards: player.purchased.filter((c) => c.bonus === color),
  }));

  const columns = (showStack: boolean) => (
    <ul
      aria-label={`${player.name}: ${tokenList(player.tokens) || '0 tokens'}`}
      data-anchor={`tokens-${player.id}`}
      className="flex items-start gap-[0.7em]"
    >
      {byColor.map(({ color, cards }) => (
        <ColorColumn
          key={color}
          color={color}
          tokens={player.tokens[color]}
          cards={cards}
          scale={scale}
          showStack={showStack}
          anchor={`token-${player.id}-${color}`}
        />
      ))}
      <li
        aria-label={`${strings.gems.gold}: ${player.tokens.gold}`}
        className="flex flex-col items-center gap-[0.6em]"
      >
        <span data-anchor={`token-${player.id}-gold`}>
          <TokenChip
            color="gold"
            size="fluid"
            count={player.tokens.gold}
            dimmed={player.tokens.gold === 0}
          />
        </span>
      </li>
    </ul>
  );

  const extras = (
    <div className="flex flex-wrap items-start gap-x-[1.4em] gap-y-[1em]">
      {player.reserved.length > 0 && (
        <div>
          <h4 className={sectionLabel}>{strings.table.reserved}</h4>
          <ul className="flex gap-[0.6em]">
            {player.reserved.map((r, i) => (
              <motion.li
                key={r.hidden ? `hidden-${i}` : r.card.id}
                layoutId={r.hidden ? undefined : `card-${r.card.id}`}
                initial={r.hidden ? { opacity: 0, y: -12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ layout: { duration: 0.42, ease: 'easeInOut' }, duration: 0.3 }}
              >
                {r.hidden ? (
                  <span role="img" aria-label={strings.table.hiddenReserve(r.level)}>
                    <CardBack level={r.level} scale={scale} />
                  </span>
                ) : isViewer && onReserved ? (
                  <button
                    type="button"
                    onClick={() => onReserved(r.card)}
                    aria-label={`${describeCard(r.card)}${buyableReserved.has(r.card.id) ? `. ${strings.card.affordable}` : ''}`}
                    title={describeCard(r.card)}
                    className="rounded-[0.55em] transition-transform hover:-translate-y-0.5"
                  >
                    <CardFace
                      card={r.card}
                      scale={scale}
                      highlight={buyableReserved.has(r.card.id)}
                    />
                  </button>
                ) : (
                  <span role="img" aria-label={describeCard(r.card)} title={describeCard(r.card)}>
                    <CardFace card={r.card} scale={scale} />
                  </span>
                )}
              </motion.li>
            ))}
          </ul>
        </div>
      )}
      {player.nobles.length > 0 && (
        <div>
          <h4 className={sectionLabel}>{strings.table.nobles}</h4>
          <ul className="flex gap-[0.6em]">
            {player.nobles.map((noble) => {
              const label = strings.nobles.describe(noble.name, requirementText(noble.requires));
              return (
                <motion.li
                  key={noble.id}
                  layoutId={`noble-${noble.id}`}
                  transition={{ layout: { duration: 0.5, ease: 'easeInOut' } }}
                >
                  <span role="img" aria-label={label} title={label} className="block">
                    <NobleTile noble={noble} scale={scale} />
                  </span>
                </motion.li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <section
      aria-label={`${player.name}, ${strings.table.points(player.points)}`}
      className={`rounded-xl border p-3 transition-colors ${isCurrent ? 'border-brass/80 bg-felt-800/90 shadow-[0_0_0_1px_var(--color-brass)]' : 'border-parchment/10 bg-felt-900/70'}`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="size-3 rounded-full"
          style={{ background: seatColor }}
        />
        <h3
          className={`min-w-0 truncate font-display font-semibold ${compact ? 'text-lg' : 'text-xl'}`}
        >
          {player.name}
        </h3>
        {isCurrent && (
          <span className="rounded-full bg-brass px-2 py-0.5 text-[0.7rem] font-semibold text-felt-950">
            {isViewer ? strings.table.yourTurn : strings.table.turnOf(player.name)}
          </span>
        )}
        {isStart && (
          <span className="rounded-full border border-parchment/25 px-2 py-0.5 text-[0.7rem] text-parchment/70">
            {strings.table.startingPlayer}
          </span>
        )}
        {offline && (
          <span className="rounded-full border border-gem-ruby/60 px-2 py-0.5 text-[0.7rem] text-[#f0a0a8]">
            {online.table.offline}
          </span>
        )}
        <span className="ml-auto flex items-baseline gap-3 text-right">
          <span className="text-xs text-parchment/60 tabular-nums">
            {strings.table.tokensHeld(player.tokenCount, rules.maxTokens)}
          </span>
          <span>
            <span
              className={`font-display leading-none font-bold text-brass tabular-nums ${compact ? 'text-3xl' : 'text-4xl'}`}
            >
              {player.points}
            </span>
            <span className="ml-1 text-xs text-parchment/60">{strings.table.prestige}</span>
          </span>
        </span>
      </header>

      <div style={{ fontSize: CARD_SCALES[scale] }}>
        {/* Phones: opponents start as a compact summary (chips and card counts). */}
        {collapsible && (
          <div className={`flex flex-col gap-[0.8em] md:hidden ${expanded ? 'hidden' : ''}`}>
            {columns(false)}
            <p className="text-xs text-parchment/65">
              {strings.table.bonusSummary(
                player.purchased.length,
                player.reserved.length,
                player.nobles.length,
              )}
            </p>
          </div>
        )}
        <div
          className={`flex-wrap items-start gap-x-[1.6em] gap-y-[1.2em] ${collapsed ? 'hidden md:flex' : 'flex'}`}
        >
          {columns(true)}
          {extras}
        </div>
        {collapsible && (
          <div className="mt-2 flex md:hidden">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((e) => !e)}
              className="ml-auto rounded-md px-2 py-1 text-xs text-parchment/80 underline-offset-4 hover:underline"
            >
              {expanded ? strings.table.hideCards : strings.table.showCards}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
