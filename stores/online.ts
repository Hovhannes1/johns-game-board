import { create } from 'zustand';
import type { ActionIntent, GameView, RuleError } from '@/games/splendor/engine';
import { getGameModule } from '@/platform/games/registry';
import type { Envelope } from '@/platform/net/envelope';
import { createRoomTransport } from '@/platform/net/factory';
import { createLoopbackPair } from '@/platform/net/loopback';
import type { IcePathKind } from '@/platform/net/transport';
import {
  BrowserRoomStore,
  getOrCreateClientKey,
  saveClientHistory,
} from '@/platform/room/browser-store';
import type { ClientStatus, EndReason } from '@/platform/room/client';
import { RoomClient } from '@/platform/room/client';
import type { Room, RoomEvents } from '@/platform/room/host-room';
import { HostRoomManager } from '@/platform/room/host-room';
import { HostRuntime } from '@/platform/room/host-runtime';
import type {
  Ack,
  ChatMessage,
  ClientEvent,
  ClientPayload,
  RoomSettings,
  RoomView,
  SeatColorId,
} from '@/lib/protocol';

export type ConnectionStatus = ClientStatus;
export type { EndReason };

interface HostCreateInput {
  gameId: string;
  name: string;
  password?: string;
  settings: RoomSettings;
  hostName: string;
  hostColor: SeatColorId;
  includeTurn?: boolean;
}

interface OnlineState {
  status: ConnectionStatus;
  icePath: IcePathKind;
  isHosting: boolean;
  joining: boolean;
  joinError: string | null;
  endReason: EndReason | null;
  code: string | null;
  room: RoomView | null;
  view: GameView | null;
  chat: ChatMessage[];
  clockOffset: number;
  hostCreate: (
    input: HostCreateInput,
  ) => Promise<{ ok: true; code: string } | { ok: false; message: string }>;
  resumeHost: (code: string, gameId: string, includeTurn?: boolean) => Promise<boolean>;
  connectClient: (code: string, gameId: string, includeTurn?: boolean) => void;
  submitJoin: (join: {
    name: string;
    color: SeatColorId;
    spectator: boolean;
    password?: string;
  }) => void;
  disconnect: () => void;
  send: <E extends ClientEvent>(event: E, payload: ClientPayload<E>) => Promise<Ack>;
  intent: (intent: ActionIntent) => Promise<RuleError | null>;
}

let activeClient: RoomClient | null = null;
let activeRuntime: HostRuntime | null = null;
let activeManager: HostRoomManager | null = null;
let activeCleanup: (() => void) | null = null;
let activeCode: string | null = null;

async function teardown() {
  activeCleanup?.();
  activeCleanup = null;
  activeCode = null;
  const c = activeClient;
  const r = activeRuntime;
  const m = activeManager;
  activeClient = null;
  activeRuntime = null;
  activeManager = null;
  await c?.close();
  await r?.close();
  m?.shutdown();
}

function attachHostLifecycle(manager: HostRoomManager, room: Room) {
  if (typeof window === 'undefined') return () => {};
  const onVisibility = () => {
    if (document.visibilityState === 'visible') manager.checkDeadlines(room);
  };
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (room.status === 'playing' || room.members.length > 1) {
      e.preventDefault();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', onBeforeUnload);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}

export const useOnline = create<OnlineState>()((set, get) => {
  const wireClientCallbacks = () => ({
    onStatus: (
      status: ClientStatus,
      info?: { code?: string; message?: string; path?: IcePathKind },
    ) => {
      set((s) => ({
        status,
        icePath: info?.path ?? s.icePath,
        joining: status === 'connecting' ? s.joining : false,
        joinError:
          status === 'rejected'
            ? (info?.message ?? 'Unable to join.')
            : status === 'connected'
              ? null
              : s.joinError,
      }));
    },
    onRoom: (room: RoomView) => set({ room, clockOffset: room.serverNow - Date.now() }),
    onGame: (raw: unknown) => {
      const view = raw as GameView;
      const current = get().view;
      if (current && view.version < current.version && view.status === current.status) return;
      set({ view });
    },
    onChatHistory: (chat: ChatMessage[]) => set({ chat }),
    onChatMessage: (message: ChatMessage) => set({ chat: [...get().chat, message].slice(-150) }),
    onGameFinished: (entry: Parameters<typeof saveClientHistory>[0]) => {
      saveClientHistory(entry);
    },
    onEnded: (reason: EndReason) => {
      set({ status: 'ended', endReason: reason });
    },
  });

  const startHostSession = (
    manager: HostRoomManager,
    room: Room,
    hostMemberId: string,
    gameId: string,
    includeTurn: boolean,
    bindEvents: (ev: RoomEvents) => void,
  ) => {
    const mod = getGameModule(gameId);
    if (!mod) throw new Error(`Unknown game module: ${gameId}`);
    const hostKey = getOrCreateClientKey(room.code);
    const runtime = new HostRuntime(manager, room, mod, {
      hostMemberId,
      hostClientKey: hostKey,
    });
    bindEvents(runtime.createRoomEvents());

    const loopback = createLoopbackPair<Envelope>('host-lb', 'host-ui');
    const netTransport = createRoomTransport({
      gameId,
      code: room.code,
      isHost: true,
      includeTurn,
    });
    runtime.attachTransport(loopback.host, { isLocal: true });
    runtime.attachTransport(netTransport, { isLocal: false });

    const client = new RoomClient(
      loopback.client,
      { clientKey: hostKey },
      wireClientCallbacks(),
      true,
    );

    activeManager = manager;
    activeRuntime = runtime;
    activeClient = client;
    activeCode = room.code;
    activeCleanup = attachHostLifecycle(manager, room);
  };

  return {
    status: 'idle',
    icePath: 'unknown',
    isHosting: false,
    joining: false,
    joinError: null,
    endReason: null,
    code: null,
    room: null,
    view: null,
    chat: [],
    clockOffset: 0,

    hostCreate: async (input) => {
      await teardown();
      const store = new BrowserRoomStore();
      await store.open();
      let events: RoomEvents | null = null;
      const manager = new HostRoomManager(
        store,
        {
          roomChanged: (r) => events?.roomChanged(r),
          gameChanged: (r) => events?.gameChanged(r),
          chat: (r, m) => events?.chat(r, m),
          memberRemoved: (r, id, reason) => events?.memberRemoved(r, id, reason),
        },
        { info: () => {}, warn: () => {}, error: (e, f) => console.error(e, f) },
      );
      manager.load();
      const created = manager.create({
        gameId: input.gameId,
        name: input.name,
        passwordHash: input.password ?? '',
        settings: input.settings,
        hostName: input.hostName,
        hostColor: input.hostColor,
      });
      if (!created.ok) return { ok: false, message: created.message };

      try {
        window.sessionStorage?.setItem(`jgb:host:${created.room.code}`, '1');
      } catch {
        // Ignore storage errors.
      }

      set({
        status: 'connecting',
        icePath: 'unknown',
        isHosting: true,
        joinError: null,
        endReason: null,
        code: created.room.code,
        room: null,
        view: null,
        chat: [],
      });

      startHostSession(
        manager,
        created.room,
        created.member.id,
        input.gameId,
        input.includeTurn ?? true,
        (ev) => {
          events = ev;
        },
      );
      return { ok: true, code: created.room.code };
    },

    resumeHost: async (rawCode, gameId, includeTurn = true) => {
      const code = rawCode.toUpperCase();
      if (activeRuntime && activeCode === code) return true;
      await teardown();
      const store = new BrowserRoomStore();
      await store.open();
      let events: RoomEvents | null = null;
      const manager = new HostRoomManager(
        store,
        {
          roomChanged: (r) => events?.roomChanged(r),
          gameChanged: (r) => events?.gameChanged(r),
          chat: (r, m) => events?.chat(r, m),
          memberRemoved: (r, id, reason) => events?.memberRemoved(r, id, reason),
        },
        { info: () => {}, warn: () => {}, error: (e, f) => console.error(e, f) },
      );
      manager.load();
      const room = manager.findByCode(code);
      if (!room) return false;
      const hostMember = room.members.find((m) => m.isHost);
      if (!hostMember) return false;

      set({
        status: 'connecting',
        icePath: 'unknown',
        isHosting: true,
        joinError: null,
        endReason: null,
        code,
        room: null,
        view: null,
        chat: [],
      });

      startHostSession(manager, room, hostMember.id, gameId, includeTurn, (ev) => {
        events = ev;
      });
      return true;
    },

    connectClient: (rawCode, gameId, includeTurn = true) => {
      const code = rawCode.toUpperCase();
      if (activeCode === code && (activeClient || activeRuntime)) return;
      void teardown().then(() => {
        if (activeCode !== null) return;
        activeCode = code;
        set({
          status: 'searching',
          icePath: 'unknown',
          isHosting: false,
          joinError: null,
          endReason: null,
          code,
          room: null,
          view: null,
          chat: [],
        });
        const transport = createRoomTransport({ gameId, code, isHost: false, includeTurn });
        const clientKey = getOrCreateClientKey(code);
        activeClient = new RoomClient(transport, { clientKey }, wireClientCallbacks(), false);
      });
    },

    submitJoin: (join) => {
      set({ joinError: null, joining: true });
      activeClient?.submitJoin(join);
    },

    disconnect: () => {
      void teardown();
      set({
        status: 'idle',
        icePath: 'unknown',
        isHosting: false,
        joinError: null,
        endReason: null,
        code: null,
        room: null,
        view: null,
        chat: [],
      });
    },

    send: (event, payload) => {
      if (!activeClient) {
        return Promise.resolve({
          ok: false,
          error: { code: 'OFFLINE', message: 'Not connected to the room host.' },
        });
      }
      return activeClient.send(event, payload);
    },

    intent: async (intent) => {
      const view = get().view;
      if (!view) return { code: 'MALFORMED_ACTION', message: 'No game in progress.' };
      const ack = await get().send('game:intent', {
        version: view.version,
        intent,
      } as ClientPayload<'game:intent'>);
      return ack.ok ? null : ({ code: ack.error.code, message: ack.error.message } as RuleError);
    },
  };
});
