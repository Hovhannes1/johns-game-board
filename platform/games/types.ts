import type { ZodType } from 'zod';

export interface GameSeat {
  id: string;
  name: string;
}

export interface GameRecord<Action = unknown> {
  seats: GameSeat[];
  startingPlayerIndex?: number;
  seed: string;
  actions: Action[];
}

export interface GameStandingSummary {
  name: string;
  points: number;
  cards: number;
  nobles: number;
  rank: number;
  winner: boolean;
}

export interface GameResultSummary {
  rounds: number;
  reason: 'targetReached' | 'stalemate';
  standings: GameStandingSummary[];
}

/**
 * Contract every board game on the platform implements so the generic room
 * host, lobby, transport, and gallery work without game-specific logic.
 */
export interface GameModule<
  State = unknown,
  Intent = unknown,
  Action extends { playerId: string } = { playerId: string },
  View = unknown,
> {
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly intentSchema: ZodType<Intent>;
  create(config: { players: GameSeat[]; startingPlayerIndex?: number }, seed: string): State;
  apply(
    state: State,
    playerId: string,
    intent: Intent,
  ): { ok: true; state: State } | { ok: false; error: { code: string; message: string } };
  replay(record: GameRecord<Action>): State;
  viewFor(state: State, viewerId: string | null): View;
  autoIntent(state: State, playerId: string): Intent | null;
  versionOf(state: State): number;
  statusOf(state: State): 'playing' | 'finished';
  currentPlayer(state: State): GameSeat | null;
  playersOf(state: State): readonly GameSeat[];
  lastAction(state: State): Action | null;
  resultOf(state: State): GameResultSummary | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any, any, any>;
