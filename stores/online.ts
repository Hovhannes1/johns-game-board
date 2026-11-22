import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { ActionIntent, GameView, RuleError } from '@/engine';
import type { Ack, ChatMessage, ClientEvent, ClientPayload, RoomView } from '@/lib/protocol';

/**
 * Online room connection (Milestone 3). The server is authoritative: this
 * store only mirrors what it sends and forwards intents with the version the
 * player saw, so stale moves are rejected (5.3).
 */

export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'unauthorized' | 'ended';
export type EndReason = 'kicked' | 'closed' | 'left' | 'expired';

interface OnlineState {
  status: ConnectionStatus;
  endReason: EndReason | null;
  code: string | null;
  room: RoomView | null;
  view: GameView | null;
  chat: ChatMessage[];
  /** serverNow - Date.now() at the last room update, for countdowns. */
  clockOffset: number;
  connect: (code: string) => void;
  disconnect: () => void;
  send: <E extends ClientEvent>(event: E, payload: ClientPayload<E>) => Promise<Ack>;
  intent: (intent: ActionIntent) => Promise<RuleError | null>;
}

let socket: Socket | null = null;

export const useOnline = create<OnlineState>()((set, get) => ({
  status: 'idle',
  endReason: null,
  code: null,
  room: null,
  view: null,
  chat: [],
  clockOffset: 0,

  connect: (code) => {
    if (socket && get().code === code) return;
    socket?.disconnect();
    set({ status: 'connecting', code, room: null, view: null, chat: [], endReason: null });
    const s = io({
      transports: ['websocket'],
      auth: { room: code },
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    socket = s;
    s.on('connect', () => set({ status: 'connected' }));
    s.on('disconnect', () => {
      if (get().status !== 'ended') set({ status: 'reconnecting' });
    });
    s.on('connect_error', (error: Error) => {
      if (error.message === 'UNAUTHORIZED') {
        s.disconnect();
        set({ status: 'unauthorized' });
      } else if (get().status === 'connecting' || get().status === 'connected') {
        set({ status: 'reconnecting' });
      }
    });
    s.on('room:state', (room: RoomView) => set({ room, clockOffset: room.serverNow - Date.now() }));
    s.on('game:view', (view: GameView) => {
      // Ignore anything older than what we already show (out-of-order delivery).
      const current = get().view;
      if (current && view.version < current.version && view.status === current.status) return;
      set({ view });
    });
    s.on('chat:history', (chat: ChatMessage[]) => set({ chat }));
    s.on('chat:message', (message: ChatMessage) =>
      set({ chat: [...get().chat, message].slice(-150) }),
    );
    s.on('session:ended', (info: { reason: EndReason }) => {
      set({ status: 'ended', endReason: info.reason });
      s.disconnect();
    });
  },

  disconnect: () => {
    socket?.disconnect();
    socket = null;
    set({ status: 'idle', code: null, room: null, view: null, chat: [] });
  },

  send: (event, payload) =>
    new Promise<Ack>((resolve) => {
      if (!socket?.connected) {
        resolve({
          ok: false,
          error: { code: 'OFFLINE', message: 'Not connected to the game server.' },
        });
        return;
      }
      socket.timeout(8000).emit(event, payload, (err: Error | null, ack: Ack) => {
        resolve(
          err
            ? { ok: false, error: { code: 'TIMEOUT', message: 'The server did not answer.' } }
            : ack,
        );
      });
    }),

  intent: async (intent) => {
    const view = get().view;
    if (!view) return { code: 'MALFORMED_ACTION', message: 'No game in progress.' };
    const ack = await get().send('game:intent', {
      version: view.version,
      intent,
    } as ClientPayload<'game:intent'>);
    return ack.ok ? null : ({ code: ack.error.code, message: ack.error.message } as RuleError);
  },
}));
