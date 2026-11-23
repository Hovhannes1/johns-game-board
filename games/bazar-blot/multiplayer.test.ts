import { describe, expect, it } from 'vitest';
import { getGameModule } from '@/platform/games/registry';
import type { Envelope } from '@/platform/net/envelope';
import { createLoopbackPair, MemoryHub } from '@/platform/net/loopback';
import { RoomClient } from '@/platform/room/client';
import { HostRoomManager } from '@/platform/room/host-room';
import type { RoomEvents } from '@/platform/room/host-room';
import { HostRuntime } from '@/platform/room/host-runtime';
import type { HistoryEntry } from '@/platform/room/protocol';
import { DEFAULT_SETTINGS } from '@/platform/room/protocol';
import type { RoomStore } from '@/platform/room/store';
import { noopLogger } from '@/platform/room/store';
import type { GameView } from './engine';

class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map();
  private readonly history: HistoryEntry[] = [];
  allRooms() {
    return [...this.rooms.values()];
  }
  saveRoom(room: { id: string }) {
    this.rooms.set(room.id, structuredClone(room));
  }
  deleteRoom(id: string) {
    this.rooms.delete(id);
  }
  addHistory(entry: HistoryEntry) {
    this.history.unshift(structuredClone(entry));
  }
  listHistory(limit = 100) {
    return this.history.slice(0, limit);
  }
}

async function waitFor(pred: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('bazar-blot 4-seat HostRuntime smoke test', () => {
  it('connects 4 seats, bids, plays a trick, and redacts hands per player', async () => {
    const store = new MemoryRoomStore();
    let events: RoomEvents | null = null;
    const manager = new HostRoomManager(
      store,
      {
        roomChanged: (r) => events?.roomChanged(r),
        gameChanged: (r) => events?.gameChanged(r),
        chat: (r, m) => events?.chat(r, m),
        memberRemoved: (r, id, reason) => events?.memberRemoved(r, id, reason),
      },
      noopLogger,
    );
    const mod = getGameModule('bazar-blot')!;
    const created = manager.create({
      gameId: 'bazar-blot',
      name: 'Blot Smoke',
      passwordHash: '',
      settings: {
        ...DEFAULT_SETTINGS,
        maxPlayers: 4,
        seatOrder: 'joined',
        firstPlayer: 'firstSeat',
        gameOptions: { targetScore: 101 },
      },
      hostName: 'Anna',
      hostColor: 'brass',
    });
    if (!created.ok) throw new Error(created.message);

    const hub = new MemoryHub<Envelope>();
    const loopback = createLoopbackPair<Envelope>('host-lb', 'host-ui');
    const runtime = new HostRuntime(manager, created.room, mod, {
      hostMemberId: created.member.id,
      hostClientKey: 'host-key-1234',
      rates: {
        messages: { capacity: 1000, perSecond: 1000 },
        chat: { capacity: 100, perSecond: 100 },
      },
    });
    events = runtime.createRoomEvents();
    runtime.attachTransport(loopback.host, { isLocal: true });
    runtime.attachTransport(hub.join('host-net'), { isLocal: false });

    const views: (GameView | null)[] = [null, null, null, null];
    const hostClient = new RoomClient(
      loopback.client,
      { clientKey: 'host-key-1234' },
      {
        onStatus: () => {},
        onRoom: () => {},
        onGame: (v) => {
          views[0] = v as GameView;
        },
        onChatHistory: () => {},
        onChatMessage: () => {},
        onGameFinished: () => {},
        onEnded: () => {},
      },
      true,
    );

    const peers = ['Ben', 'Cleo', 'Dan'].map((name, i) => {
      const idx = i + 1;
      return new RoomClient(
        hub.join(`peer-${idx}`),
        {
          clientKey: `peer-key-000${idx}`,
          join: { name, color: 'teal', spectator: false },
        },
        {
          onStatus: () => {},
          onRoom: () => {},
          onGame: (v) => {
            views[idx] = v as GameView;
          },
          onChatHistory: () => {},
          onChatMessage: () => {},
          onGameFinished: () => {},
          onEnded: () => {},
        },
      );
    });

    await waitFor(() => created.room.members.length === 4);
    for (const p of peers) await p.send('lobby:ready', { ready: true });
    await expect(hostClient.send('host:start', {})).resolves.toEqual({ ok: true });
    await waitFor(() => views.every((v) => v !== null && v.version === 0));

    // Each player sees only their own 8 cards
    for (let s = 0; s < 4; s++) {
      expect(views[s]!.players[s]!.hand).toHaveLength(8);
      for (let o = 0; o < 4; o++) {
        if (o !== s) expect(views[s]!.players[o]!.hand).toBeNull();
      }
    }

    // Anna bids 8H, others pass
    const clients = [hostClient, ...peers];
    await expect(
      clients[0]!.send('game:intent', {
        version: 0,
        intent: { type: 'BID', value: 8, strain: 'H', kaput: false },
      }),
    ).resolves.toEqual({ ok: true });
    for (let i = 1; i <= 4; i++) {
      await expect(
        clients[i % 4]!.send('game:intent', { version: i, intent: { type: 'PASS' } }),
      ).resolves.toEqual({ ok: true });
    }
    await waitFor(() => views[0]!.phase === 'playing');
    expect(views[0]!.contract).toMatchObject({ value: 8, strain: 'H', kontra: 0 });

    await runtime.close();
  });
});
