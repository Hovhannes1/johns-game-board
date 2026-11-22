import type {
  Ack,
  ChatMessage,
  HistoryEntry,
  RoomSummary,
  RoomView,
  SeatColorId,
} from '@/platform/room/protocol';

export const MAX_ENVELOPE_BYTES = 16 * 1024;

export interface HelloPayload {
  clientKey: string;
  /** Present when joining for the first time (not needed when rejoining with clientKey). */
  join?: {
    name: string;
    color: SeatColorId;
    spectator: boolean;
    password?: string;
  };
}

export type WelcomePayload =
  | {
      ok: true;
      memberId: string;
      hostKey: string;
      gameId: string;
      claimed: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
      needsJoin?: boolean;
    };

export type PushEventMap = {
  'room:state': RoomView;
  'game:view': unknown;
  'chat:history': ChatMessage[];
  'chat:message': ChatMessage;
  'game:finished': HistoryEntry;
  'session:ended': { reason: 'kicked' | 'closed' | 'left' | 'expired' };
  'room:summary': RoomSummary;
};

export type PushEventName = keyof PushEventMap;

export type Envelope =
  | { k: 'req'; id: number; e: string; p: unknown }
  | { k: 'ack'; id: number; r: Ack }
  | { k: 'evt'; e: PushEventName; p: unknown }
  | { k: 'sys'; e: 'hello'; p: HelloPayload }
  | { k: 'sys'; e: 'welcome'; p: WelcomePayload }
  | { k: 'sys'; e: 'ping'; t: number }
  | { k: 'sys'; e: 'pong'; t: number }
  | { k: 'sys'; e: 'bye'; reason?: string };

const encoder = new TextEncoder();

export function envelopeByteLength(data: unknown): number {
  try {
    return encoder.encode(typeof data === 'string' ? data : JSON.stringify(data)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function isEnvelope(v: unknown): v is Envelope {
  if (!v || typeof v !== 'object') return false;
  const k = (v as { k?: unknown }).k;
  return k === 'req' || k === 'ack' || k === 'evt' || k === 'sys';
}
