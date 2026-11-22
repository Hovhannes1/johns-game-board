/**
 * Compatibility facade over platform/room/protocol and games/splendor/protocol.
 * Kept while the legacy Socket.IO server is still present; removed in Milestone 6.
 */
import { z } from 'zod';
import type { GameView } from '@/games/splendor/engine/view';
import { intentSchema } from '@/games/splendor/protocol';
import {
  LIMITS,
  SEAT_COLOR_IDS,
  displayName,
  lobbyMessages,
  password,
  roomName,
  roomSettingsSchema,
} from '@/platform/room/protocol';
import type { ChatMessage, RoomView } from '@/platform/room/protocol';

export * from '@/platform/room/protocol';
export { intentSchema } from '@/games/splendor/protocol';

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

export const clientMessages = {
  ...lobbyMessages,
  'game:intent': z.strictObject({ version: z.number().int().min(0), intent: intentSchema }),
} as const;

export type ClientEvent = keyof typeof clientMessages;
export type ClientPayload<E extends ClientEvent> = z.input<(typeof clientMessages)[E]>;

export interface ServerEvents {
  'room:state': (room: RoomView) => void;
  'game:view': (view: GameView) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'chat:message': (message: ChatMessage) => void;
  'session:ended': (info: { reason: 'kicked' | 'closed' | 'left' | 'expired' }) => void;
}
