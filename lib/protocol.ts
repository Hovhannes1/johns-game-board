/**
 * Wire protocol shared by the server and the browser. Every inbound message
 * is validated with these strict schemas; unknown fields are rejected (SEC-8).
 */
import { z } from 'zod';
import { GEM_COLORS, TOKEN_COLORS } from '@/engine/gems';
import type { ActionIntent } from '@/engine/types';
import type { GameView } from '@/engine/view';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Seat colors players can pick (FR-2). */
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

/** Drops control and formatting characters, collapses whitespace (SEC-12). */
export function cleanText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const cleanString = (max: number) =>
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
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

// ---------------------------------------------------------------------------
// Room settings (3.7)
// ---------------------------------------------------------------------------

export const TURN_TIMERS = [0, 60, 120, 180] as const;
export const DISCONNECT_SKIPS = [0, 60, 180, 300] as const;

export const roomSettingsSchema = z.strictObject({
  maxPlayers: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  /** Seconds per turn; 0 = off. On timeout the server plays a safe move. */
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
// HTTP API bodies
// ---------------------------------------------------------------------------

export const adminLoginSchema = z.strictObject({
  secret: z.string().min(1).max(LIMITS.adminSecretMax),
});

export const createRoomSchema = z.strictObject({
  name: roomName,
  password,
  settings: roomSettingsSchema,
  hostName: displayName,
  hostColor: z.enum(SEAT_COLOR_IDS),
});
export type CreateRoomBody = z.infer<typeof createRoomSchema>;

export const joinRoomSchema = z.strictObject({
  password: z.string().min(1).max(LIMITS.passwordMax),
  name: displayName,
  color: z.enum(SEAT_COLOR_IDS),
  spectator: z.boolean(),
});
export type JoinRoomBody = z.infer<typeof joinRoomSchema>;

export const roomAdminSchema = z.strictObject({ locked: z.boolean().optional() });

// ---------------------------------------------------------------------------
// Game intents (FR-16)
// ---------------------------------------------------------------------------

const gem = z.enum(GEM_COLORS);
const tokenCount = z.number().int().min(0).max(10);
const level = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const intentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('TAKE_THREE'), colors: z.array(gem).min(1).max(3) }),
  z.strictObject({ type: z.literal('TAKE_TWO'), color: gem }),
  z.strictObject({ type: z.literal('RESERVE_FACE_UP'), cardId: id }),
  z.strictObject({ type: z.literal('RESERVE_FROM_DECK'), level }),
  z.strictObject({ type: z.literal('BUY_FACE_UP'), cardId: id }),
  z.strictObject({ type: z.literal('BUY_RESERVED'), cardId: id }),
  z.strictObject({
    type: z.literal('RETURN_TOKENS'),
    tokens: z.strictObject(
      Object.fromEntries(TOKEN_COLORS.map((c) => [c, tokenCount.optional()])) as Record<
        (typeof TOKEN_COLORS)[number],
        z.ZodOptional<typeof tokenCount>
      >,
    ),
  }),
  z.strictObject({ type: z.literal('CHOOSE_NOBLE'), nobleId: id }),
  z.strictObject({ type: z.literal('PASS') }),
]);

// Compile-time check that the schema produces engine intents.
const _intentCheck = (i: z.infer<typeof intentSchema>): ActionIntent => i;
void _intentCheck;

// ---------------------------------------------------------------------------
// Socket messages: client -> server
// ---------------------------------------------------------------------------

export const clientMessages = {
  'lobby:ready': z.strictObject({ ready: z.boolean() }),
  'lobby:leave': z.strictObject({}),
  'host:start': z.strictObject({}),
  'host:kick': z.strictObject({ memberId: id }),
  'host:lock': z.strictObject({ locked: z.boolean() }),
  'host:settings': z.strictObject({ settings: roomSettingsSchema }),
  'host:playAgain': z.strictObject({}),
  'host:close': z.strictObject({}),
  'game:intent': z.strictObject({ version: z.number().int().min(0), intent: intentSchema }),
  'chat:send': z.strictObject({ text: cleanString(LIMITS.chatMax) }),
  'chat:emote': z.strictObject({ emote: z.enum(EMOTES) }),
} as const;

export type ClientEvent = keyof typeof clientMessages;
export type ClientPayload<E extends ClientEvent> = z.input<(typeof clientMessages)[E]>;

export type Ack = { ok: true } | { ok: false; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Socket messages: server -> client
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
  /** Server clock when this was sent, so clients can correct for clock skew. */
  serverNow: number;
}

export interface ChatMessage {
  id: string;
  /** 'system' for server notices. */
  memberId: string;
  name: string;
  color: SeatColorId | null;
  kind: 'text' | 'emote' | 'system';
  text: string;
  at: number;
}

export interface ServerEvents {
  'room:state': (room: RoomView) => void;
  'game:view': (view: GameView) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'chat:message': (message: ChatMessage) => void;
  'session:ended': (info: { reason: 'kicked' | 'closed' | 'left' | 'expired' }) => void;
}

// ---------------------------------------------------------------------------
// HTTP API responses
// ---------------------------------------------------------------------------

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

export interface HistoryEntry {
  id: string;
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

export interface ApiError {
  error: { code: string; message: string };
}
