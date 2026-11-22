import { GEM_COLORS, TOKEN_COLORS } from '@/games/splendor/engine';
import type { CardDef, GameEvent, GemCounts, LogEntry, TokenColor } from '@/games/splendor/engine';
import type { Catalog } from './catalog';
import { joinList, strings } from './strings';

/** "2 diamond and 1 gold" */
export function tokenList(tokens: Partial<Record<TokenColor, number>>): string {
  const parts = TOKEN_COLORS.filter((c) => (tokens[c] ?? 0) > 0).map(
    (c) => `${tokens[c]} ${strings.gems[c]}`,
  );
  return joinList(parts);
}

/** "Level II emerald card" */
export function cardTitle(card: Pick<CardDef, 'level' | 'bonus'>): string {
  return strings.card.title(card.level, strings.gems[card.bonus]);
}

export function costText(cost: GemCounts): string {
  return tokenList(cost) || strings.log.forFree;
}

/** Full accessible description of a card. */
export function describeCard(card: CardDef): string {
  return strings.card.describe(
    card.level,
    strings.gems[card.bonus],
    card.points,
    costText(card.cost),
  );
}

export function requirementText(requires: GemCounts): string {
  return joinList(
    GEM_COLORS.filter((c) => requires[c] > 0).map((c) => `${requires[c]} ${strings.gems[c]}`),
  );
}

export interface LogContext {
  catalog: Catalog;
  playerName(id: string): string;
}

function cardText(ctx: LogContext, id: string | null): string | null {
  if (!id) return null;
  const card = ctx.catalog.card(id);
  return card ? cardTitle(card) : null;
}

/** One human-readable line per event, or null for events not worth logging. */
export function formatEvent(event: GameEvent, ctx: LogContext): string | null {
  const t = strings.log;
  switch (event.type) {
    case 'TOKENS_TAKEN':
      return t.tookTokens(ctx.playerName(event.playerId), tokenList(event.tokens));
    case 'CARD_RESERVED': {
      const name = ctx.playerName(event.playerId);
      const card = cardText(ctx, event.cardId);
      const base = event.fromDeck
        ? t.reservedBlind(name, strings.levels[event.level], card)
        : t.reservedFaceUp(name, card ?? strings.levels[event.level]);
      return base + (event.gold > 0 ? t.withGold : t.noGold);
    }
    case 'CARD_PURCHASED':
      return t.bought(
        ctx.playerName(event.playerId),
        cardText(ctx, event.cardId) ?? event.cardId,
        tokenList(event.payment) || t.forFree,
        event.fromReserve,
      );
    case 'TOKENS_RETURNED':
      return t.returned(ctx.playerName(event.playerId), tokenList(event.tokens));
    case 'NOBLE_VISITED':
      return t.noble(
        ctx.playerName(event.playerId),
        ctx.catalog.noble(event.nobleId)?.name ?? event.nobleId,
      );
    case 'PASSED':
      return t.passed(ctx.playerName(event.playerId));
    case 'FINAL_ROUND':
      return t.finalRound(ctx.playerName(event.playerId), event.points);
    case 'GAME_ENDED':
      return t.gameEnded(event.reason, t.winnersList(event.winners.map(ctx.playerName)));
    case 'CARD_DEALT':
      return null;
  }
}

export interface LogLine {
  key: string;
  seq: number;
  text: string;
}

export function formatLog(log: readonly LogEntry[], ctx: LogContext): LogLine[] {
  return log.flatMap((entry) =>
    entry.events.flatMap((event, i) => {
      const text = formatEvent(event, ctx);
      return text ? [{ key: `${entry.seq}-${i}`, seq: entry.seq, text }] : [];
    }),
  );
}
