import type { GemColor, GemCounts, TokenColor, TokenCounts } from './gems';

export type Level = 1 | 2 | 3;
export const LEVELS: readonly Level[] = [1, 2, 3];

export type PerLevel<T> = { 1: T; 2: T; 3: T };

// ---------------------------------------------------------------------------
// Static content (card packs, FR-22/FR-24)
// ---------------------------------------------------------------------------

export interface CardDef {
  id: string;
  level: Level;
  bonus: GemColor;
  points: number;
  cost: GemCounts;
}

export interface NobleDef {
  id: string;
  name: string;
  points: number;
  requires: GemCounts;
}

export interface CardPack {
  id: string;
  version: string;
  name: string;
  cards: readonly CardDef[];
  nobles: readonly NobleDef[];
}

export interface PackInfo {
  id: string;
  version: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Rules and configuration
// ---------------------------------------------------------------------------

export interface RuleSet {
  minPlayers: number;
  maxPlayers: number;
  /** Prestige needed to trigger the final round. */
  targetPoints: number;
  /** Max tokens (gold included) a player may hold at end of turn. */
  maxTokens: number;
  maxReserved: number;
  /** A color needs at least this many tokens in supply to take two of it. */
  takeTwoMinSupply: number;
  /** Face-up cards per level. */
  marketSize: number;
  goldTokens: number;
  /** Tokens per gem color, keyed by player count. */
  gemTokensByPlayers: Record<number, number>;
  /** Nobles revealed, keyed by player count. */
  noblesByPlayers: Record<number, number>;
}

export interface PlayerSeat {
  id: string;
  name: string;
}

export interface GameConfig {
  /** Seat order, clockwise. */
  players: readonly PlayerSeat[];
  pack: CardPack;
  /** Seat index of the first player; random (from the seed) when omitted. */
  startingPlayerIndex?: number;
  /** House-rule overrides (future variants). */
  rules?: Partial<RuleSet>;
}

// ---------------------------------------------------------------------------
// Actions (FR-16)
// ---------------------------------------------------------------------------

export type ActionIntent =
  /** Take different colors: 3, or every available color when fewer than 3 remain. */
  | { type: 'TAKE_THREE'; colors: GemColor[] }
  | { type: 'TAKE_TWO'; color: GemColor }
  | { type: 'RESERVE_FACE_UP'; cardId: string }
  | { type: 'RESERVE_FROM_DECK'; level: Level }
  | { type: 'BUY_FACE_UP'; cardId: string }
  | { type: 'BUY_RESERVED'; cardId: string }
  | { type: 'RETURN_TOKENS'; tokens: Partial<TokenCounts> }
  | { type: 'CHOOSE_NOBLE'; nobleId: string }
  | { type: 'PASS' };

export type ActionType = ActionIntent['type'];

export const ACTION_TYPES: readonly ActionType[] = [
  'TAKE_THREE',
  'TAKE_TWO',
  'RESERVE_FACE_UP',
  'RESERVE_FROM_DECK',
  'BUY_FACE_UP',
  'BUY_RESERVED',
  'RETURN_TOKENS',
  'CHOOSE_NOBLE',
  'PASS',
];

export type GameAction = ActionIntent & { playerId: string };

// ---------------------------------------------------------------------------
// Events and log (FR-9, FR-17)
// ---------------------------------------------------------------------------

export type GameEndReason = 'targetReached' | 'stalemate';

export type GameEvent =
  | { type: 'TOKENS_TAKEN'; playerId: string; tokens: Partial<Record<GemColor, number>> }
  | {
      type: 'CARD_RESERVED';
      playerId: string;
      /** null in redacted views when the card was reserved blind by someone else. */
      cardId: string | null;
      level: Level;
      fromDeck: boolean;
      gold: number;
    }
  | {
      type: 'CARD_PURCHASED';
      playerId: string;
      cardId: string;
      fromReserve: boolean;
      payment: Partial<TokenCounts>;
    }
  | { type: 'CARD_DEALT'; level: Level; slot: number; cardId: string }
  | { type: 'TOKENS_RETURNED'; playerId: string; tokens: Partial<TokenCounts> }
  | { type: 'NOBLE_VISITED'; playerId: string; nobleId: string }
  | { type: 'PASSED'; playerId: string }
  | { type: 'FINAL_ROUND'; playerId: string; points: number }
  | { type: 'GAME_ENDED'; reason: GameEndReason; winners: string[] };

export interface LogEntry {
  /** State version after this entry was applied (1-based). */
  seq: number;
  playerId: string;
  action: ActionIntent;
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export interface ReservedCard {
  cardId: string;
  /** Blind reserve from the top of a deck: hidden from opponents (FR-21). */
  fromDeck: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  tokens: TokenCounts;
  /** Card ids in purchase order. */
  purchased: string[];
  reserved: ReservedCard[];
  nobles: string[];
  turnsTaken: number;
}

export type TurnPhase =
  | { kind: 'action' }
  | { kind: 'returnTokens'; count: number }
  | { kind: 'chooseNoble'; options: string[] };

export type GameStatus = 'playing' | 'finished';

export type TieBreak = 'none' | 'fewestCards' | 'shared';

export interface Standing {
  playerId: string;
  points: number;
  purchasedCount: number;
  rank: number;
}

export interface GameResult {
  reason: GameEndReason;
  winners: string[];
  tieBreak: TieBreak;
  standings: Standing[];
}

export interface GameCatalog {
  cards: Record<string, CardDef>;
  nobles: Record<string, NobleDef>;
}

export interface GameState {
  schemaVersion: 1;
  /** Server-side only; never included in views (FR-18, FR-20). */
  seed: string;
  pack: PackInfo;
  /** Immutable content lookup; shared between state copies. */
  catalog: GameCatalog;
  rules: RuleSet;
  players: PlayerState[];
  startPlayerIndex: number;
  currentPlayerIndex: number;
  /** 1-based round counter. */
  round: number;
  phase: TurnPhase;
  status: GameStatus;
  supply: TokenCounts;
  /** Index 0 is the top of each deck. */
  decks: PerLevel<string[]>;
  market: PerLevel<(string | null)[]>;
  nobles: string[];
  /** Someone reached the target; the round is being completed. */
  finalRound: boolean;
  /** Consecutive PASS actions, used to detect a dead position. */
  consecutivePasses: number;
  /** Number of actions applied; also the anti-replay version (section 5.3). */
  version: number;
  /** Append-only action log (FR-17). */
  log: LogEntry[];
  result: GameResult | null;
}

export type { GemColor, GemCounts, TokenColor, TokenCounts };
