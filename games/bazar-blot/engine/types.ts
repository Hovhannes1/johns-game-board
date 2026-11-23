import type { CardId, Rank, Strain, Suit } from './cards';

export const TARGET_SCORES = [101, 151, 201, 301] as const;
export type TargetScore = (typeof TARGET_SCORES)[number];

export const MIN_BID = 8;
export const MAX_BID = 25;

export type TeamIndex = 0 | 1;
export type Phase = 'bidding' | 'kontra' | 'playing';

export interface PlayerSeat {
  id: string;
  name: string;
}

export interface GameConfig {
  players: PlayerSeat[];
  startingPlayerIndex?: number;
  options?: { targetScore?: TargetScore };
}

export interface Bid {
  value: number;
  strain: Strain;
  kaput: boolean;
}

export type BidCall =
  { seat: number; type: 'BID'; bid: Bid } | { seat: number; type: 'PASS' | 'KONTRA' | 'REKONTRA' };

export interface Contract {
  seat: number;
  team: TeamIndex;
  value: number;
  strain: Strain;
  kaput: boolean;
  /** 0 = base, 1 = Kontra, 2 = Rekontra */
  kontra: 0 | 1 | 2;
}

export type ComboKind = 'TERZ' | 'FIFTY' | 'HUNDRED' | 'FOUR';

export interface Combo {
  id: string;
  seat: number;
  team: TeamIndex;
  kind: ComboKind;
  cards: CardId[];
  points: number;
  topRank: Rank;
  suit: Suit | null;
}

export interface BlotInfo {
  seat: number;
  team: TeamIndex;
  /** Number of K/Q of trump played so far (2 = Blot-Reblot scored). */
  played: 0 | 1 | 2;
}

export interface TrickPlay {
  seat: number;
  card: CardId;
}

export interface CompletedTrick {
  leader: number;
  winner: number;
  plays: TrickPlay[];
}

export interface RoundSummary {
  roundNo: number;
  dealer: number;
  redeal: boolean;
  contract?: Contract;
  made?: boolean;
  kaput?: boolean;
  reverseKaput?: boolean;
  trickPoints?: [number, number];
  tricksWon?: [number, number];
  sai?: [number, number];
  comboPoints?: [number, number];
  blotTeam?: TeamIndex | null;
  awarded?: [number, number];
  totalsAfter: [number, number];
}

export type ActionIntent =
  | { type: 'BID'; value: number; strain: Strain; kaput: boolean }
  | { type: 'PASS' }
  | { type: 'KONTRA' }
  | { type: 'REKONTRA' }
  | { type: 'PLAY'; card: CardId };

export type GameAction = ActionIntent & { playerId: string };

export interface LogEntry {
  version: number;
  playerId: string;
  seat: number;
  action: ActionIntent;
}

export interface MatchResult {
  winningTeam: TeamIndex;
  reason: 'targetReached' | 'reverseKaput';
}

export interface GameState {
  version: number;
  status: 'playing' | 'finished';
  options: { targetScore: TargetScore };
  seed: string;
  players: PlayerSeat[];
  roundNo: number;
  dealer: number;
  turnSeq: number;
  currentSeat: number;
  phase: Phase;
  hands: CardId[][];
  bidding: {
    calls: BidCall[];
    high: { seat: number; bid: Bid } | null;
    passesInRow: number;
    kontraBy: number | null;
    responders: number[];
  };
  contract: Contract | null;
  trick: {
    leader: number;
    plays: TrickPlay[];
  };
  lastTrick: CompletedTrick | null;
  captured: {
    points: [number, number];
    tricks: [number, number];
  };
  combos: {
    /** Detected combos per seat, announced when that seat plays its first card. */
    bySeat: Combo[][];
    /** Seats that have already played at least one card this round. */
    announcedSeats: boolean[];
    resolved: {
      winningTeam: TeamIndex | null;
      valid: Combo[];
    } | null;
    blot: BlotInfo | null;
  };
  scores: [number, number];
  rounds: RoundSummary[];
  log: LogEntry[];
  result: MatchResult | null;
}

export function teamOf(seat: number): TeamIndex {
  return (seat % 2) as TeamIndex;
}

export function nextSeat(seat: number): number {
  return (seat + 1) % 4;
}
