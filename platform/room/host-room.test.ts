import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '@/games/splendor/engine';
import { ROOM_CODE_LENGTH, cryptoShuffle, newRoomCode } from '@/platform/crypto';
import type { Room, RoomEvents } from './host-room';
import { HostRoomManager, LIMITS } from './host-room';
import type { HistoryEntry, RoomSettings } from './protocol';
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

const events = (): RoomEvents & { removed: string[] } => {
  const removed: string[] = [];
  return {
    removed,
    roomChanged: () => {},
    gameChanged: () => {},
    chat: () => {},
    memberRemoved: (_r, id) => removed.push(id),
  };
};

function setup(settings: Partial<RoomSettings> = {}, store: RoomStore = new MemoryRoomStore()) {
  const ev = events();
  const manager = new HostRoomManager(store, ev, noopLogger);
  const created = manager.create({
    name: 'Test',
    passwordHash: '',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    hostName: 'Anna',
    hostColor: 'brass',
  });
  if (!created.ok) throw new Error(created.message);
  const room = created.room as Room<GameState>;
  const ben = manager.join(room, { name: 'Ben', color: 'teal', spectator: false });
  if (!ben.ok) throw new Error(ben.message);
  manager.setReady(room, ben.member.id, true);
  return { manager, room, store, ev, hostId: created.member.id, benId: ben.member.id };
}

function startPlaying(
  manager: HostRoomManager,
  room: Room<GameState>,
  hostId: string,
  benId: string,
) {
  manager.connect(room, hostId);
  manager.connect(room, benId);
  expect(manager.start(room, hostId)).toEqual({ ok: true });
  return room.state!;
}

describe('HostRoomManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays a safe move when the turn timer runs out', () => {
    const { manager, room, hostId, benId } = setup({ turnTimer: 60 });
    const state = startPlaying(manager, room, hostId, benId);
    const first = state.players[state.currentPlayerIndex]!.id;
    expect(room.deadline).not.toBeNull();
    vi.advanceTimersByTime(59_000);
    expect(room.state!.version).toBe(0);
    vi.advanceTimersByTime(2_000);
    expect(room.state!.version).toBeGreaterThan(0);
    expect(room.state!.players[room.state!.currentPlayerIndex]!.id).not.toBe(first);
    expect(room.chat.some((m) => /time ran out/.test(m.text))).toBe(true);
  });

  it('auto-plays a disconnected player only when the room allows it', () => {
    const { manager, room, hostId, benId } = setup({ disconnectSkip: 60 });
    const state = startPlaying(manager, room, hostId, benId);
    const current = state.players[state.currentPlayerIndex]!.id;
    vi.advanceTimersByTime(120_000);
    expect(room.state!.version).toBe(0);
    manager.disconnect(room, current);
    vi.advanceTimersByTime(61_000);
    expect(room.state!.version).toBeGreaterThan(0);
    expect(room.chat.some((m) => /disconnected/.test(m.text))).toBe(true);
  });

  it('waits when nobody is connected at all', () => {
    const { manager, room, hostId, benId } = setup({ turnTimer: 60, disconnectSkip: 60 });
    startPlaying(manager, room, hostId, benId);
    manager.disconnect(room, hostId);
    manager.disconnect(room, benId);
    vi.advanceTimersByTime(10 * 60_000);
    expect(room.state!.version).toBe(0);
  });

  it('auto-plays an open seat after a short grace period', () => {
    const { manager, room, hostId, benId } = setup();
    const state = startPlaying(manager, room, hostId, benId);
    expect(manager.kick(room, hostId, benId)).toEqual({ ok: true });
    const benTurn = state.players[state.currentPlayerIndex]!.id === benId;
    if (!benTurn) {
      const intent = { type: 'TAKE_TWO', color: 'ruby' } as const;
      expect(manager.act(room, hostId, 0, intent)).toEqual({ ok: true });
    }
    const before = room.state!.version;
    vi.advanceTimersByTime(LIMITS.openSeatSkipMs + 100);
    expect(room.state!.version).toBeGreaterThan(before);
  });

  it('rejects stale versions and moves by spectators or other players', () => {
    const { manager, room, hostId, benId } = setup({ spectators: true });
    const spectator = manager.join(room, { name: 'Watcher', color: 'sky', spectator: true });
    if (!spectator.ok) throw new Error('join failed');
    const state = startPlaying(manager, room, hostId, benId);
    const current = state.players[state.currentPlayerIndex]!.id;
    const other = current === hostId ? benId : hostId;
    const take = { type: 'TAKE_TWO', color: 'ruby' } as const;
    expect(manager.act(room, other, 0, take)).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(manager.act(room, spectator.member.id, 0, take)).toMatchObject({
      ok: false,
      code: 'NOT_A_PLAYER',
    });
    expect(manager.act(room, current, 5, take)).toMatchObject({ ok: false, code: 'STALE_VERSION' });
    expect(manager.act(room, current, 0, take)).toEqual({ ok: true });
    expect(manager.act(room, current, 0, take)).toMatchObject({ ok: false, code: 'STALE_VERSION' });
  });

  it('restores rooms and games from the store', () => {
    const { manager, room, hostId, benId, store } = setup();
    const state = startPlaying(manager, room, hostId, benId);
    const current = state.players[state.currentPlayerIndex]!.id;
    manager.act(room, current, 0, { type: 'TAKE_TWO', color: 'onyx' });
    const reloaded = new HostRoomManager(store, events(), noopLogger);
    reloaded.load();
    const again = reloaded.findByCode(room.code)!;
    expect(again.state).toEqual(room.state);
    expect(again.members.map((m) => m.name)).toEqual(['Anna', 'Ben']);
  });

  it('enforces room size, unique names, spectator setting and lock', () => {
    const { manager, room } = setup({ maxPlayers: 2 });
    expect(manager.join(room, { name: 'ben', color: 'rose', spectator: false })).toMatchObject({
      code: 'NAME_TAKEN',
    });
    expect(manager.join(room, { name: 'Cleo', color: 'rose', spectator: false })).toMatchObject({
      code: 'ROOM_FULL',
    });
    expect(manager.join(room, { name: 'Cleo', color: 'rose', spectator: true })).toMatchObject({
      code: 'SPECTATORS_DISABLED',
    });
    manager.setLocked(room, true);
    expect(manager.join(room, { name: 'Dee', color: 'rose', spectator: false })).toMatchObject({
      code: 'ROOM_LOCKED',
    });
  });

  it('picks a free color when the chosen one is taken', () => {
    const { manager, room } = setup();
    const cleo = manager.join(room, { name: 'Cleo', color: 'brass', spectator: false });
    expect(cleo.ok && cleo.member.color).not.toBe('brass');
  });

  it('cleans up idle rooms', () => {
    const { manager, room } = setup();
    vi.setSystemTime(Date.now() + LIMITS.idleLobbyMs + 1000);
    const fresh = new HostRoomManager(new MemoryRoomStore(), events(), noopLogger);
    expect(fresh.cleanup()).toBe(0);
    expect(manager.cleanup()).toBe(1);
    expect(manager.findByCode(room.code)).toBeUndefined();
  });
});

describe('platform/crypto', () => {
  it('generates long, unambiguous room codes', () => {
    const codes = new Set(Array.from({ length: 500 }, newRoomCode));
    expect(codes.size).toBe(500);
    for (const code of codes) {
      expect(code).toMatch(new RegExp(`^[A-HJ-NP-Z2-9]{${ROOM_CODE_LENGTH}}$`));
    }
  });

  it('shuffles without mutating or losing elements', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const shuffled = cryptoShuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shuffled.slice().sort()).toEqual(input);
  });
});
