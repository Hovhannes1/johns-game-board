'use client';

import { motion } from 'motion/react';
import { LEVELS } from '@/games/splendor/engine';
import type { CardDef, GameView, Level, NobleDef } from '@/games/splendor/engine';
import { CardBack, CardFace, EmptySlot } from '@/games/splendor/components/art/CardArt';
import { NobleTile } from '@/games/splendor/components/art/NobleArt';
import { describeCard, requirementText } from '@/games/splendor/lib/format';
import { strings } from '@/games/splendor/lib/strings';

interface MarketProps {
  view: GameView;
  buyable: ReadonlySet<string>;
  canAct: boolean;
  onCard: (card: CardDef) => void;
  onDeck: (level: Level) => void;
}

/** 3x4 grid of face-up cards with their decks, Level III on top (FR-7). */
export function Market({ view, buyable, canAct, onCard, onDeck }: MarketProps) {
  return (
    <section
      aria-label={strings.table.market}
      className="flex flex-col gap-[clamp(0.3rem,1vw,0.6rem)]"
    >
      {[...LEVELS].reverse().map((level) => (
        <div key={level} className="flex items-center gap-[clamp(0.3rem,1vw,0.6rem)]">
          <button
            type="button"
            onClick={() => onDeck(level)}
            disabled={view.deckCounts[level] === 0}
            aria-label={strings.table.deckLabel(level, view.deckCounts[level])}
            title={strings.table.deckLabel(level, view.deckCounts[level])}
            className="rounded-[0.55em] transition-transform hover:-translate-y-0.5 disabled:opacity-30"
          >
            {view.deckCounts[level] > 0 ? (
              <CardBack level={level} count={view.deckCounts[level]} />
            ) : (
              <EmptySlot />
            )}
          </button>
          {view.market[level].map((card, slot) =>
            card ? (
              <motion.button
                key={card.id}
                type="button"
                // Shared layout id: when this card is bought or reserved it glides to the player.
                layoutId={`card-${card.id}`}
                // Newly dealt cards flip in from the deck side (4.2).
                initial={{ opacity: 0, x: -24, rotateY: 75 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
                onClick={() => onCard(card)}
                aria-label={`${describeCard(card)}${canAct && buyable.has(card.id) ? `. ${strings.card.affordable}` : ''}`}
                title={describeCard(card)}
                className="rounded-[0.55em] transition-transform hover:-translate-y-1"
              >
                <CardFace card={card} highlight={canAct && buyable.has(card.id)} />
              </motion.button>
            ) : (
              <span key={`empty-${level}-${slot}`} role="img" aria-label={strings.table.emptySlot}>
                <EmptySlot />
              </span>
            ),
          )}
        </div>
      ))}
    </section>
  );
}

export function NobleRow({ nobles }: { nobles: readonly NobleDef[] }) {
  return (
    <section aria-label={strings.table.nobles}>
      <ul className="flex flex-wrap gap-[clamp(0.3rem,1vw,0.6rem)]">
        {nobles.map((noble) => {
          const label = strings.nobles.describe(noble.name, requirementText(noble.requires));
          return (
            <motion.li key={noble.id} layoutId={`noble-${noble.id}`}>
              <span role="img" aria-label={label} title={label} className="block">
                <NobleTile noble={noble} scale="noble" />
              </span>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
