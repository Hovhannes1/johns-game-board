/**
 * Generic room, lobby, and chat wire protocol shared across all games.
 * Every inbound message is validated with strict zod schemas (unknown fields rejected).
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const SEAT_COLOR_IDS = ['brass', 'teal', 'rose', 'violet', 'sky', 'lime'] as const;
export type SeatColorId = (typeof SEAT_COLOR_IDS)[number];

export const EMOTES = ['👍', '👏', '😄', '😮', '🤔', '😅', '💎', '🎉'] as const;
export type Emote = (typeof EMOTES)[number];

export const LIMITS = {
  nameMax: 20,
  roomNameMax: 40,
  passwordMin: 6,
  passwordMax: 128,
  chatMax: 200,
  adminSecretMax: 200,
} as const;

/** Drops control and formatting characters, collapses whitespace. */
export function cleanText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const cleanString = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform(cleanText)
    .pipe(z.string().min(1).max(max));

export const displayName = cleanString(LIMITS.nameMax);
export const roomName = cleanString(LIMITS.roomNameMax);
export const password = z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax);
export const roomCode = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{10}$/));
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

// ---------------------------------------------------------------------------
// Room settings
// ---------------------------------------------------------------------------

export const TURN_TIMERS = [0, 60, 120, 180] as const;
export const DISCONNECT_SKIPS = [0, 60, 180, 300] as const;

export const roomSettingsSchema = z.strictObject({
  maxPlayers: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  /** Seconds per turn; 0 = off. On timeout the host plays a safe move. */
  turnTimer: z.union(TURN_TIMERS.map((n) => z.literal(n))),
  seatOrder: z.enum(['random', 'joined']),
  firstPlayer: z.enum(['random', 'firstSeat']),
  spectators: z.boolean(),
  /** Seconds a disconnected player's turn waits before being auto-played; 0 = wait. */
  disconnectSkip: z.union(DISCONNECT_SKIPS.map((n) => z.literal(n))),
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 4,
  turnTimer: 0,
  seatOrder: 'random',
  firstPlayer: 'random',
  spectators: false,
  disconnectSkip: 0,
};

// ---------------------------------------------------------------------------
// Generic lobby/host/chat messages: client -> host
// ---------------------------------------------------------------------------

export const lobbyMessages = {
  'lobby:ready': z.strictObject({ ready: z.boolean() }),
  'lobby:leave': z.strictObject({}),
  'host:start': z.strictObject({}),
  'host:kick': z.strictObject({ memberId: idSchema }),
  'host:lock': z.strictObject({ locked: z.boolean() }),
  'host:settings': z.strictObject({ settings: roomSettingsSchema }),
  'host:playAgain': z.strictObject({}),
  'host:close': z.strictObject({}),
  'chat:send': z.strictObject({ text: cleanString(LIMITS.chatMax) }),
  'chat:emote': z.strictObject({ emote: z.enum(EMOTES) }),
} as const;

export type LobbyEvent = keyof typeof lobbyMessages;
export type LobbyPayload<E extends LobbyEvent> = z.input<(typeof lobbyMessages)[E]>;

export type Ack = { ok: true } | { ok: false; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Host -> client views & events
// ---------------------------------------------------------------------------

export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type MemberRole = 'player' | 'spectator';

export interface MemberView {
  id: string;
  name: string;
  color: SeatColorId;
  role: MemberRole;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  /** Seat left open mid-game (its player was removed); a new joiner can take it. */
  open: boolean;
}

export interface RoomView {
  code: string;
  name: string;
  status: RoomStatus;
  locked: boolean;
  settings: RoomSettings;
  members: MemberView[];
  me: { memberId: string; role: MemberRole; isHost: boolean };
  /** Why the host cannot start yet, or null when they can. */
  startBlocker: string | null;
  /** Epoch ms when the current turn is auto-played, or null. */
  turnDeadline: number | null;
  /** Host clock when this was sent, so clients can correct for clock skew. */
  serverNow: number;
}

export interface ChatMessage {
  id: string;
  /** 'system' for host/room notices. */
  memberId: string;
  name: string;
  color: SeatColorId | null;
  kind: 'text' | 'emote' | 'system';
  text: string;
  at: number;
}

export interface HistoryEntry {
  id: string;
  gameId?: string;
  roomName: string;
  finishedAt: number;
  rounds: number;
  reason: 'targetReached' | 'stalemate';
  players: {
    name: string;
    points: number;
    cards: number;
    nobles: number;
    rank: number;
    winner: boolean;
  }[];
}

export interface SessionInfo {
  seat: { roomCode: string; memberId: string } | null;
  admin: boolean;
}

export interface RoomSummary {
  code: string;
  name: string;
  status: RoomStatus;
  locked: boolean;
  players: number;
  maxPlayers: number;
  spectators: number;
  updatedAt: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
