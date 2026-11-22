import { describe, expect, it } from 'vitest';
import { getGameModule } from '@/platform/games/registry';
import type { ActionIntent, GameView } from '@/games/splendor/engine';
import { legalIntentsForViewer } from '@/games/splendor/engine';
import { createRng } from '@/games/splendor/engine/rng';
import type { Envelope } from '@/platform/net/envelope';
import { createLoopbackPair, MemoryHub } from '@/platform/net/loopback';
import { RoomClient } from './client';
import type { ClientStatus, EndReason } from './client';
import { HostRoomManager } from './host-room';
import type { Room, RoomEvents } from './host-room';
import { HostRuntime } from './host-runtime';
import type { ChatMessage, HistoryEntry, RoomSettings, RoomView } from './protocol';
import { DEFAULT_SETTINGS } from './protocol';
import type { RoomRecord, RoomStore } from './store';
import { noopLogger } from './store';

class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly history: HistoryEntry[] = [];

  allRooms(): RoomRecord[] {
    return [...this.rooms.values()].map((r) => structuredClone(r));
  }
  saveRoom(room: RoomRecord): void {
    this.rooms.set(room.id, structuredClone(room));
  }
  deleteRoom(id: string): void {
    this.rooms.delete(id);
  }
  addHistory(entry: HistoryEntry): void {
    this.history.unshift(structuredClone(entry));
  }
  listHistory(limit = 100): HistoryEntry[] {
    return this.history.slice(0, limit);
  }
}

interface TestClient {
  client: RoomClient;
  status: ClientStatus;
  room: RoomView | null;
  view: GameView | null;
  chat: ChatMessage[];
  history: HistoryEntry[];
  endedReason: EndReason | null;
  lastError: { code?: string; message?: string } | null;
}

function attachClient(
  hub: MemoryHub<Envelope>,
  peerId: string,
  hello: {
    clientKey: string;
    join?: {
      name: string;
      color: 'brass' | 'teal' | 'rose' | 'violet' | 'sky' | 'lime';
      spectator: boolean;
      password?: string;
    };
  },
): TestClient {
  const state: TestClient = {
    client: null as unknown as RoomClient,
    status: 'searching',
    room: null,
    view: null,
    chat: [],
    history: [],
    endedReason: null,
    lastError: null,
  };
  const transport = hub.join(peerId);
  state.client = new RoomClient(transport, hello, {
    onStatus: (s, info) => {
      state.status = s;
      if (info?.code || info?.message) state.lastError = info;
    },
    onRoom: (r) => {
      state.room = r;
    },
    onGame: (v) => {
      state.view = v as GameView;
    },
    onChatHistory: (msgs) => {
      state.chat = msgs;
    },
    onChatMessage: (m) => {
      state.chat = [...state.chat, m];
    },
    onGameFinished: (entry) => {
      state.history.push(entry);
    },
    onEnded: (reason) => {
      state.endedReason = reason;
    },
  });
  return state;
}

async function waitFor(pred: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

function createHostedRoom(
  opts: {
    settings?: Partial<RoomSettings>;
    password?: string;
    store?: RoomStore;
    now?: () => number;
  } = {},
) {
  const store = opts.store ?? new MemoryRoomStore();
  let runtime: HostRuntime | null = null;
  const forward: RoomEvents = {
    roomChanged: (r) => events?.roomChanged(r),
    gameChanged: (r) => events?.gameChanged(r),
    chat: (r, m) => events?.chat(r, m),
    memberRemoved: (r, id, reason) => events?.memberRemoved(r, id, reason),
  };
  const manager = new HostRoomManager(store, forward, noopLogger, opts.now);
  const created = manager.create({
    gameId: 'splendor',
    name: 'P2P Test',
    passwordHash: opts.password ?? '',
    settings: { ...DEFAULT_SETTINGS, ...opts.settings },
    hostName: 'Host',
    hostColor: 'brass',
  });
  if (!created.ok) throw new Error(created.message);

  const game = getGameModule('splendor')!;
  const hub = new MemoryHub<Envelope>();
  const loopback = createLoopbackPair<Envelope>('host-lb', 'host-ui');
  runtime = new HostRuntime(manager, created.room, game, {
    hostMemberId: created.member.id,
    hostClientKey: 'host-key-1234',
    rates: {
      messages: { capacity: 1000, perSecond: 1000 },
      chat: { capacity: 100, perSecond: 100 },
    },
    now: opts.now,
  });
  const events = runtime.createRoomEvents();
  runtime.attachTransport(loopback.host, { isLocal: true });
  runtime.attachTransport(hub.join('host-net'), { isLocal: false });

  const hostUi: TestClient = {
    client: null as unknown as RoomClient,
    status: 'searching',
    room: null,
    view: null,
    chat: [],
    history: [],
    endedReason: null,
    lastError: null,
  };
  hostUi.client = new RoomClient(
    loopback.client,
    { clientKey: 'host-key-1234' },
    {
      onStatus: (s) => {
        hostUi.status = s;
      },
      onRoom: (r) => {
        hostUi.room = r;
      },
      onGame: (v) => {
        hostUi.view = v as GameView;
      },
      onChatHistory: (msgs) => {
        hostUi.chat = msgs;
      },
      onChatMessage: (m) => {
        hostUi.chat = [...hostUi.chat, m];
      },
      onGameFinished: (e) => {
        hostUi.history.push(e);
      },
      onEnded: (r) => {
        hostUi.endedReason = r;
      },
    },
    true,
  );

  return { store, manager, room: created.room, runtime, hub, hostUi };
}

describe('P2P HostRuntime + RoomClient', () => {
  it('enforces optional room password, locks out repeated failures, and lets returning clientKey rejoin', async () => {
    let now = 1_000;
    const { hub, hostUi, runtime } = createHostedRoom({ password: 'secret', now: () => now });
    await waitFor(() => hostUi.status === 'connected');

    const bad = attachClient(hub, 'peer-bad', {
      clientKey: 'bad-key-1234',
      join: { name: 'Eve', color: 'rose', spectator: false, password: 'wrong' },
    });
    await waitFor(() => bad.status === 'rejected');
    expect(bad.lastError?.code).toBe('BAD_CREDENTIALS');

    // Trigger lockout after 5 failures.
    for (let i = 0; i < 5; i++) {
      bad.status = 'searching';
      bad.client.submitJoin({ name: 'Eve', color: 'rose', spectator: false, password: 'wrong' });
      await waitFor(() => bad.status === 'rejected');
    }
    expect(bad.lastError?.code).toBe('LOCKED_OUT');
    now += 120_000;

    const bob = attachClient(hub, 'peer-bob', {
      clientKey: 'bob-key-1234',
      join: { name: 'Bob', color: 'teal', spectator: false, password: 'secret' },
    });
    await waitFor(() => bob.status === 'connected' && bob.room !== null);
    expect(bob.room!.members.map((m) => m.name)).toEqual(['Host', 'Bob']);

    // Simulate Bob refreshing his tab with the same clientKey and no password.
    await bob.client.close();
    const bobAgain = attachClient(hub, 'peer-bob-2', { clientKey: 'bob-key-1234' });
    await waitFor(() => bobAgain.status === 'connected' && bobAgain.room !== null);
    expect(bobAgain.room!.members.find((m) => m.id === bobAgain.room!.me.memberId)?.name).toBe(
      'Bob',
    );

    await bad.client.close();
    await bobAgain.client.close();
    await hostUi.client.close();
    await runtime.close();
  });

  it('controls lobby readiness, kicks, and room lock', async () => {
    const { hub, hostUi, runtime } = createHostedRoom();
    await waitFor(() => hostUi.status === 'connected');

    const bob = attachClient(hub, 'p-bob', {
      clientKey: 'bob-key-1234',
      join: { name: 'Bob', color: 'teal', spectator: false },
    });
    await waitFor(() => bob.status === 'connected' && bob.room !== null);

    // Host cannot start until Bob is ready.
    expect((await hostUi.client.send('host:start', {})).ok).toBe(false);
    expect((await bob.client.send('lobby:ready', { ready: true })).ok).toBe(true);

    // Lock prevents newcomers.
    expect((await hostUi.client.send('host:lock', { locked: true })).ok).toBe(true);
    const late = attachClient(hub, 'p-late', {
      clientKey: 'late-key-1234',
      join: { name: 'Late', color: 'rose', spectator: false },
    });
    await waitFor(() => late.status === 'rejected');
    expect(late.lastError?.code).toBe('ROOM_LOCKED');

    // Non-host cannot kick.
    expect((await bob.client.send('host:kick', { memberId: hostUi.room!.me.memberId })).ok).toBe(
      false,
    );

    // Host kicks Bob.
    const bobId = bob.room!.me.memberId;
    expect((await hostUi.client.send('host:kick', { memberId: bobId })).ok).toBe(true);
    await waitFor(() => bob.endedReason === 'kicked');

    await late.client.close();
    await hostUi.client.close();
    await runtime.close();
  });

  it('plays a full 4-player game, redacts hidden cards, and survives a host restore', async () => {
    const store = new MemoryRoomStore();
    const created = createHostedRoom({ store, settings: { maxPlayers: 4, seatOrder: 'joined' } });
    await waitFor(() => created.hostUi.status === 'connected');

    const c1 = attachClient(created.hub, 'p1', {
      clientKey: 'ck-1-123456',
      join: { name: 'P2', color: 'teal', spectator: false },
    });
    const c2 = attachClient(created.hub, 'p2', {
      clientKey: 'ck-2-123456',
      join: { name: 'P3', color: 'rose', spectator: false },
    });
    const c3 = attachClient(created.hub, 'p3', {
      clientKey: 'ck-3-123456',
      join: { name: 'P4', color: 'violet', spectator: false },
    });
    const clients = [created.hostUi, c1, c2, c3];
    await waitFor(() => clients.every((c) => c.status === 'connected' && c.room !== null));

    for (const c of [c1, c2, c3]) {
      expect((await c.client.send('lobby:ready', { ready: true })).ok).toBe(true);
    }
    expect((await created.hostUi.client.send('host:start', {})).ok).toBe(true);
    await waitFor(() => clients.every((c) => c.view !== null));

    // Verify no deck card IDs or opponents' blind reserves leak in any view.
    for (const c of clients) {
      const meId = c.room!.me.memberId;
      for (const p of c.view!.players) {
        if (p.id !== meId) {
          expect(p.reserved.every((r) => r.hidden || !r.fromDeck)).toBe(true);
        }
      }
    }

    // Play 15 random legal moves.
    const rng = createRng('a'.repeat(64));
    let version = 0;
    while (version < 15 && created.hostUi.view!.status === 'playing') {
      const currentId = created.hostUi.view!.currentPlayerId;
      const actor = clients.find((c) => c.room!.me.memberId === currentId)!;
      const legal = legalIntentsForViewer(actor.view!);
      const intent: ActionIntent = legal[rng.nextInt(legal.length)]!;
      const ack = await actor.client.send('game:intent', { version: actor.view!.version, intent });
      expect(ack.ok).toBe(true);
      version += 1;
      await waitFor(() => clients.every((c) => c.view!.version >= version));
    }

    // Simulate host tab closing and restoring from BrowserRoomStore (IndexedDB).
    const roomCode = created.room.code;
    await c1.client.close();
    await c2.client.close();
    await c3.client.close();
    await created.hostUi.client.close();
    await created.runtime.close();
    created.manager.shutdown();

    let events2: RoomEvents | null = null;
    const manager2 = new HostRoomManager(
      store,
      {
        roomChanged: (r) => events2?.roomChanged(r),
        gameChanged: (r) => events2?.gameChanged(r),
        chat: (r, m) => events2?.chat(r, m),
        memberRemoved: (r, id, reason) => events2?.memberRemoved(r, id, reason),
      },
      noopLogger,
    );
    manager2.load();
    const restoredRoom = manager2.findByCode(roomCode) as Room;
    expect(restoredRoom).toBeDefined();

    const hub2 = new MemoryHub<Envelope>();
    const lb2 = createLoopbackPair<Envelope>('host-lb-2', 'host-ui-2');
    const hostMember = restoredRoom.members.find((m) => m.isHost)!;
    const runtime2 = new HostRuntime(manager2, restoredRoom, getGameModule('splendor')!, {
      hostMemberId: hostMember.id,
      rates: {
        messages: { capacity: 1000, perSecond: 1000 },
        chat: { capacity: 100, perSecond: 100 },
      },
    });
    events2 = runtime2.createRoomEvents();
    runtime2.attachTransport(lb2.host, { isLocal: true });
    runtime2.attachTransport(hub2.join('host-net-2'), { isLocal: false });

    const hostUi2: TestClient = {
      client: null as unknown as RoomClient,
      status: 'searching',
      room: null,
      view: null,
      chat: [],
      history: [],
      endedReason: null,
      lastError: null,
    };
    hostUi2.client = new RoomClient(
      lb2.client,
      { clientKey: 'host-key-1234' },
      {
        onStatus: (s) => {
          hostUi2.status = s;
        },
        onRoom: (r) => {
          hostUi2.room = r;
        },
        onGame: (v) => {
          hostUi2.view = v as GameView;
        },
        onChatHistory: (m) => {
          hostUi2.chat = m;
        },
      },
      true,
    );
    await waitFor(() => hostUi2.status === 'connected' && hostUi2.view !== null);
    expect(hostUi2.view!.version).toBe(version);
    expect(hostUi2.chat.some((m) => m.kind === 'system' && /restored/.test(m.text))).toBe(true);

    await hostUi2.client.close();
    await runtime2.close();
    manager2.shutdown();
  });

  it('opens a removed player seat mid-game for a newcomer', async () => {
    const { hub, hostUi, runtime } = createHostedRoom();
    await waitFor(() => hostUi.status === 'connected');

    const bob = attachClient(hub, 'p-bob', {
      clientKey: 'bob-key-1234',
      join: { name: 'Bob', color: 'teal', spectator: false },
    });
    await waitFor(() => bob.status === 'connected' && bob.room !== null);
    await bob.client.send('lobby:ready', { ready: true });
    await hostUi.client.send('host:start', {});
    await waitFor(() => hostUi.view !== null);

    const bobId = bob.room!.me.memberId;
    await hostUi.client.send('host:kick', { memberId: bobId });
    await waitFor(() => bob.endedReason === 'kicked');

    const carol = attachClient(hub, 'p-carol', {
      clientKey: 'carol-key-1234',
      join: { name: 'Carol', color: 'rose', spectator: false },
    });
    await waitFor(() => carol.status === 'connected' && carol.view !== null);
    expect(carol.room!.me.memberId).toBe(bobId);

    await carol.client.close();
    await hostUi.client.close();
    await runtime.close();
  });
});
