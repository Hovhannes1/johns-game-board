import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/protocol';
import type { RoomSettings } from '../lib/protocol';
import { Store } from './db';
import { silentLogger } from './logger';
import type { Room, RoomEvents } from './rooms';
import { LIMITS, RoomManager } from './rooms';
import { FailureLockout, TokenBucket } from './security/rate-limit';
import { hashPassword, passwordAlgorithm, verifyPassword } from './security/passwords';
import { newRoomCode, ROOM_CODE_LENGTH } from './security/tokens';

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

function setup(settings: Partial<RoomSettings> = {}, store = new Store(':memory:')) {
  const ev = events();
  const manager = new RoomManager(store, ev, silentLogger);
  const created = manager.create({
    name: 'Test',
    passwordHash: 'x',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    hostName: 'Anna',
    hostColor: 'brass',
  });
  if (!created.ok) throw new Error(created.message);
  const room = created.room;
  const ben = manager.join(room, { name: 'Ben', color: 'teal', spectator: false });
  if (!ben.ok) throw new Error(ben.message);
  manager.setReady(room, ben.member.id, true);
  return { manager, room, store, ev, hostId: created.member.id, benId: ben.member.id };
}

function startPlaying(manager: RoomManager, room: Room, hostId: string, benId: string) {
  manager.connect(room, hostId);
  manager.connect(room, benId);
  expect(manager.start(room, hostId)).toEqual({ ok: true });
  return room.state!;
}

describe('room manager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays a safe move when the turn timer runs out (3.7)', () => {
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

  it('auto-plays a disconnected player only when the room allows it (FR-5)', () => {
    const { manager, room, hostId, benId } = setup({ disconnectSkip: 60 });
    const state = startPlaying(manager, room, hostId, benId);
    const current = state.players[state.currentPlayerIndex]!.id;
    vi.advanceTimersByTime(120_000);
    expect(room.state!.version).toBe(0); // connected players are never auto-played without a timer
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
      // Anna moves first, then Ben's open seat should auto-play.
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

  it('restores rooms and games from the database (FR-25)', () => {
    const { manager, room, hostId, benId, store } = setup();
    const state = startPlaying(manager, room, hostId, benId);
    const current = state.players[state.currentPlayerIndex]!.id;
    manager.act(room, current, 0, { type: 'TAKE_TWO', color: 'onyx' });
    const reloaded = new RoomManager(store, events(), silentLogger);
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

  it('cleans up idle rooms (SEC-7)', () => {
    const { manager, room } = setup();
    vi.setSystemTime(Date.now() + LIMITS.idleLobbyMs + 1000);
    const fresh = new RoomManager(new Store(':memory:'), events(), silentLogger);
    expect(fresh.cleanup()).toBe(0);
    expect(manager.cleanup()).toBe(1);
    expect(manager.findByCode(room.code)).toBeUndefined();
  });
});

describe('security primitives', () => {
  it('hashes passwords with argon2id and verifies them', async () => {
    expect(passwordAlgorithm).toBe('argon2id');
    const hash = await hashPassword('correct horse');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await hashPassword('correct horse')).not.toBe(hash); // salted
  });

  it('generates long, unambiguous room codes', () => {
    const codes = new Set(Array.from({ length: 500 }, newRoomCode));
    expect(codes.size).toBe(500);
    for (const code of codes)
      expect(code).toMatch(new RegExp(`^[A-HJ-NP-Z2-9]{${ROOM_CODE_LENGTH}}$`));
  });

  it('token buckets limit bursts and refill over time', () => {
    let now = 0;
    const bucket = new TokenBucket(3, 1, () => now);
    expect([bucket.take('a'), bucket.take('a'), bucket.take('a'), bucket.take('a')]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(bucket.take('b')).toBe(true);
    now = 1000;
    expect(bucket.take('a')).toBe(true);
    expect(bucket.take('a')).toBe(false);
  });

  it('locks out with exponential backoff after repeated failures (SEC-5)', () => {
    let now = 0;
    const lockout = new FailureLockout(
      { freeAttempts: 2, baseLockMs: 1000, maxLockMs: 5000, forgetAfterMs: 60_000 },
      () => now,
    );
    lockout.fail('ip');
    lockout.fail('ip');
    expect(lockout.retryAfter('ip')).toBe(0);
    lockout.fail('ip');
    expect(lockout.retryAfter('ip')).toBe(1000);
    lockout.fail('ip');
    expect(lockout.retryAfter('ip')).toBe(2000);
    for (let i = 0; i < 5; i++) lockout.fail('ip');
    expect(lockout.retryAfter('ip')).toBe(5000);
    lockout.succeed('ip');
    expect(lockout.retryAfter('ip')).toBe(0);
    lockout.fail('other');
    now = 120_000;
    expect(lockout.retryAfter('other')).toBe(0);
  });
});
