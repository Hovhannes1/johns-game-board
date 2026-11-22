import type { PlayerContext, RulesContext } from './context';
import { bonusesOf, cardById, nobleById, pointsOf } from './derive';
import { ruleError } from './errors';
import type { RuleError } from './errors';
import { sumCounts } from './gems';
import type { GemCounts, TokenCounts } from './gems';
import { legalIntents } from './legal';
import type {
  ActionIntent,
  CardDef,
  GameResult,
  GameState,
  GameStatus,
  Level,
  LogEntry,
  NobleDef,
  PackInfo,
  PerLevel,
  RuleSet,
  TurnPhase,
} from './types';
import { validateIntent } from './validate';

export type ReservedCardView =
  | { hidden: false; fromDeck: boolean; card: CardDef }
  /** A blind reserve seen by an opponent or spectator: only the level is known. */
  | { hidden: true; fromDeck: true; level: Level };

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  tokens: TokenCounts;
  tokenCount: number;
  bonuses: GemCounts;
  points: number;
  purchased: CardDef[];
  reserved: ReservedCardView[];
  nobles: NobleDef[];
  turnsTaken: number;
}

/** What one participant may see (FR-20). Never contains the seed or deck order. */
export interface GameView {
  /** null for spectators. */
  viewerId: string | null;
  pack: PackInfo;
  rules: RuleSet;
  version: number;
  status: GameStatus;
  round: number;
  phase: TurnPhase;
  currentPlayerId: string;
  startPlayerId: string;
  finalRound: boolean;
  supply: TokenCounts;
  market: PerLevel<(CardDef | null)[]>;
  deckCounts: PerLevel<number>;
  nobles: NobleDef[];
  players: PlayerView[];
  log: LogEntry[];
  result: GameResult | null;
}

function redactEntry(entry: LogEntry, viewerId: string | null): LogEntry {
  const needsRedaction = entry.events.some(
    (e) => e.type === 'CARD_RESERVED' && e.fromDeck && e.playerId !== viewerId,
  );
  if (!needsRedaction) return entry;
  return {
    ...entry,
    events: entry.events.map((e) =>
      e.type === 'CARD_RESERVED' && e.fromDeck && e.playerId !== viewerId
        ? { ...e, cardId: null }
        : e,
    ),
  };
}

/**
 * Per-viewer redacted view (FR-20, FR-21). Face-up reserves are public; blind
 * reserves are visible only to their owner. Pass null for a spectator.
 */
export function getPublicView(state: GameState, viewerId: string | null): GameView {
  const { catalog } = state;
  const card = (id: string) => cardById(catalog, id);
  const slots = (ids: (string | null)[]) => ids.map((id) => (id === null ? null : card(id)));

  return {
    viewerId,
    pack: { ...state.pack },
    rules: state.rules,
    version: state.version,
    status: state.status,
    round: state.round,
    phase:
      state.phase.kind === 'chooseNoble'
        ? { kind: 'chooseNoble', options: [...state.phase.options] }
        : { ...state.phase },
    currentPlayerId: state.players[state.currentPlayerIndex]!.id,
    startPlayerId: state.players[state.startPlayerIndex]!.id,
    finalRound: state.finalRound,
    supply: { ...state.supply },
    market: { 1: slots(state.market[1]), 2: slots(state.market[2]), 3: slots(state.market[3]) },
    deckCounts: { 1: state.decks[1].length, 2: state.decks[2].length, 3: state.decks[3].length },
    nobles: state.nobles.map((id) => nobleById(catalog, id)),
    players: state.players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      seat,
      tokens: { ...p.tokens },
      tokenCount: sumCounts(p.tokens),
      bonuses: bonusesOf(catalog, p),
      points: pointsOf(catalog, p),
      purchased: p.purchased.map(card),
      reserved: p.reserved.map((r): ReservedCardView => {
        const def = card(r.cardId);
        if (r.fromDeck && p.id !== viewerId)
          return { hidden: true, fromDeck: true, level: def.level };
        return { hidden: false, fromDeck: r.fromDeck, card: def };
      }),
      nobles: p.nobles.map((id) => nobleById(catalog, id)),
      turnsTaken: p.turnsTaken,
    })),
    log: state.log.map((entry) => redactEntry(entry, viewerId)),
    result: state.result,
  };
}

export function contextFromView(view: GameView): RulesContext {
  return {
    status: view.status,
    rules: view.rules,
    phase: view.phase,
    currentPlayerId: view.currentPlayerId,
    supply: view.supply,
    market: view.market,
    deckCounts: view.deckCounts,
    players: view.players.map((p): PlayerContext => ({
      id: p.id,
      tokens: p.tokens,
      bonuses: p.bonuses,
      reserved: p.reserved.map((r) => (r.hidden ? null : r.card)),
    })),
  };
}

/**
 * Client-side helpers: the same rules the server enforces, evaluated on the
 * viewer's own redacted view to highlight legal moves and explain illegal ones.
 * The server re-validates everything; these are for UX only.
 */
export function legalIntentsForViewer(view: GameView): ActionIntent[] {
  if (view.viewerId === null) return [];
  return legalIntents(contextFromView(view), view.viewerId);
}

export function explainIntentForViewer(view: GameView, intent: ActionIntent): RuleError | null {
  if (view.viewerId === null) return ruleError('UNKNOWN_PLAYER');
  return validateIntent(contextFromView(view), view.viewerId, intent);
}
