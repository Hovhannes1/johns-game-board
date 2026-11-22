/**
 * Rooms, lobby and the authoritative game (FR-1..FR-6, section 5.3).
 *
 * The manager owns all room state and talks to the outside world only through
 * the `RoomEvents` callbacks, so it can be tested without sockets. Every
 * accepted action is validated by the engine, appended to the game record and
 * persisted before anyone is notified.
 */
import { basePack } from '../games/splendor/data';
import { applyAction, autoIntent, createGame, getPublicView, replayGame } from '../games/splendor/engine';
import type { ActionIntent, GameAction, GameState, GameView, PlayerSeat } from '../games/splendor/engine';
import type {
  ChatMessage,
  HistoryEntry,
  MemberRole,
  MemberView,
  RoomSettings,
  RoomStatus,
  RoomView,
  SeatColorId,
} from '../lib/protocol';
import { SEAT_COLOR_IDS } from '../lib/protocol';
import { serverErrors, systemChat } from '../games/splendor/lib/strings';
import type { Store } from './db';
import type { Logger } from './logger';
import { cryptoShuffle, newId, newRoomCode, newSeed } from './security/tokens';

export interface Member {
  id: string;
  name: string;
  color: SeatColorId;
  role: MemberRole;
  isHost: boolean;
  ready: boolean;
  joinedAt: number;
  /** Player removed mid-game: the seat waits for someone to take it over. */
  open: boolean;
}

interface GameRecord {
  seats: PlayerSeat[];
  startingPlayerIndex?: number;
  seed: string;
  actions: GameAction[];
}

interface RoomData {
  settings: RoomSettings;
  locked: boolean;
  status: RoomStatus;
  members: Member[];
  game: GameRecord | null;
}

export interface Room extends RoomData {
  id: string;
  code: string;
  name: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  // Runtime only:
  state: GameState | null;
  connections: Map<string, number>;
  disconnectedAt: Map<string, number>;
  openedAt: Map<string, number>;
  chat: ChatMessage[];
  turnStartedAt: number;
  turnOwner: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  deadline: number | null;
  lastActivity: number;
}

export interface RoomEvents {
  roomChanged(room: Room): void;
  gameChanged(room: Room): void;
  chat(room: Room, message: ChatMessage): void;
  memberRemoved(room: Room, memberId: string, reason: 'kicked' | 'closed' | 'left'): void;
}

export type ErrorCode = keyof typeof serverErrors;
export type Result<T = object> = ({ ok: true } & T) | { ok: false; code: string; message: string };

export function fail(
  code: ErrorCode,
  message?: string,
): { ok: false; code: string; message: string } {
  const text = serverErrors[code];
  return { ok: false, code, message: message ?? (typeof text === 'string' ? text : code) };
}

export const LIMITS = {
  maxRooms: 20,
  maxSpectators: 8,
  chatHistory: 100,
  /** An open seat (player removed mid-game) is auto-played after this long. */
  openSeatSkipMs: 15_000,
  idleLobbyMs: 6 * 60 * 60 * 1000,
  idleGameMs: 3 * 24 * 60 * 60 * 1000,
} as const;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly byCode = new Map<string, Room>();

  constructor(
    private readonly store: Store,
    private readonly events: RoomEvents,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  // ---------------------------------------------------------------------------
  // Loading and saving
  // ---------------------------------------------------------------------------

  /** Restores rooms after a restart; in-progress games are rebuilt by replay (FR-25). */
  load(): void {
    for (const stored of this.store.allRooms()) {
      const data = stored.data as RoomData;
      const room = this.hydrate({
        ...data,
        id: stored.id,
        code: stored.code,
        name: stored.name,
        passwordHash: stored.passwordHash,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
      });
      if (data.game && data.status !== 'lobby') {
        try {
          room.state = this.replay(data.game);
          if (room.status === 'playing') this.systemMessage(room, systemChat.restored);
        } catch (error) {
          this.log.error('room.restore_failed', { room: room.id, message: String(error) });
          room.status = 'lobby';
          room.game = null;
        }
      }
      this.index(room);
      this.schedule(room);
    }
    this.log.info('rooms.loaded', { count: this.rooms.size });
  }

  private replay(record: GameRecord): GameState {
    return replayGame(
      {
        players: record.seats,
        pack: basePack,
        ...(record.startingPlayerIndex === undefined
          ? {}
          : { startingPlayerIndex: record.startingPlayerIndex }),
      },
      record.seed,
      record.actions,
    );
  }

  private hydrate(
    base: RoomData &
      Pick<Room, 'id' | 'code' | 'name' | 'passwordHash' | 'createdAt' | 'updatedAt'>,
  ): Room {
    return {
      ...base,
      state: null,
      connections: new Map(),
      disconnectedAt: new Map(),
      openedAt: new Map(),
      chat: [],
      turnStartedAt: this.now(),
      turnOwner: null,
      timer: null,
      deadline: null,
      lastActivity: this.now(),
    };
  }

  private index(room: Room): void {
    this.rooms.set(room.id, room);
    this.byCode.set(room.code, room);
  }

  private persist(room: Room): void {
    room.updatedAt = this.now();
    room.lastActivity = room.updatedAt;
    const data: RoomData = {
      settings: room.settings,
      locked: room.locked,
      status: room.status,
      members: room.members,
      game: room.game,
    };
    this.store.saveRoom({
      id: room.id,
      code: room.code,
      name: room.name,
      passwordHash: room.passwordHash,
      data,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    });
  }

  // ---------------------------------------------------------------------------
  // Lookup
  // ---------------------------------------------------------------------------

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  findByCode(code: string): Room | undefined {
    return this.byCode.get(code);
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  member(room: Room, memberId: string): Member | undefined {
    return room.members.find((m) => m.id === memberId);
  }

  private players(room: Room): Member[] {
    return room.members.filter((m) => m.role === 'player');
  }

  // ---------------------------------------------------------------------------
  // Creating and joining (FR-1, FR-2)
  // ---------------------------------------------------------------------------

  create(input: {
    name: string;
    passwordHash: string;
    settings: RoomSettings;
    hostName: string;
    hostColor: SeatColorId;
  }): Result<{ room: Room; member: Member }> {
    if (this.rooms.size >= LIMITS.maxRooms) return fail('TOO_MANY_ROOMS');
    let code = newRoomCode();
    while (this.byCode.has(code)) code = newRoomCode();
    const now = this.now();
    const host: Member = {
      id: newId('m'),
      name: input.hostName,
      color: input.hostColor,
      role: 'player',
      isHost: true,
      ready: true,
      joinedAt: now,
      open: false,
    };
    const room = this.hydrate({
      id: newId('r'),
      code,
      name: input.name,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
      settings: input.settings,
      locked: false,
      status: 'lobby',
      members: [host],
      game: null,
    });
    this.index(room);
    this.persist(room);
    this.log.info('room.created', { room: room.id, maxPlayers: input.settings.maxPlayers });
    return { ok: true, room, member: host };
  }

  /** Seats a new person (password already verified by the caller). */
  join(
    room: Room,
    input: { name: string; color: SeatColorId; spectator: boolean },
  ): Result<{ member: Member; claimed: boolean }> {
    if (room.locked) return fail('ROOM_LOCKED');
    const nameTaken = room.members.some(
      (m) => !m.open && m.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
    );
    if (nameTaken) return fail('NAME_TAKEN');

    if (room.status === 'playing' && !input.spectator) {
      // Mid-game, a newcomer can only take over a seat the host opened.
      const open = room.members.find((m) => m.open);
      if (open) {
        open.open = false;
        room.openedAt.delete(open.id);
        this.systemMessage(room, systemChat.tookSeat(input.name, open.name));
        this.persist(room);
        this.schedule(room);
        this.events.roomChanged(room);
        return { ok: true, member: open, claimed: true };
      }
      return fail('GAME_IN_PROGRESS');
    }

    if (input.spectator) {
      if (!room.settings.spectators) return fail('SPECTATORS_DISABLED');
      if (room.members.filter((m) => m.role === 'spectator').length >= LIMITS.maxSpectators) {
        return fail('ROOM_FULL');
      }
    } else if (this.players(room).length >= room.settings.maxPlayers) {
      return fail('ROOM_FULL');
    }

    const taken = new Set(room.members.map((m) => m.color));
    const color = taken.has(input.color)
      ? (SEAT_COLOR_IDS.find((c) => !taken.has(c)) ?? input.color)
      : input.color;
    const member: Member = {
      id: newId('m'),
      name: input.name,
      color,
      role: input.spectator ? 'spectator' : 'player',
      isHost: false,
      ready: false,
      joinedAt: this.now(),
      open: false,
    };
    room.members.push(member);
    this.systemMessage(
      room,
      input.spectator ? systemChat.spectating(member.name) : systemChat.joined(member.name),
    );
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true, member, claimed: false };
  }

  // ---------------------------------------------------------------------------
  // Presence (FR-5)
  // ---------------------------------------------------------------------------

  connect(room: Room, memberId: string): void {
    room.connections.set(memberId, (room.connections.get(memberId) ?? 0) + 1);
    room.disconnectedAt.delete(memberId);
    room.lastActivity = this.now();
    this.schedule(room);
    this.events.roomChanged(room);
  }

  disconnect(room: Room, memberId: string): void {
    const left = (room.connections.get(memberId) ?? 1) - 1;
    if (left > 0) {
      room.connections.set(memberId, left);
      return;
    }
    room.connections.delete(memberId);
    room.disconnectedAt.set(memberId, this.now());
    this.schedule(room);
    this.events.roomChanged(room);
  }

  isConnected(room: Room, memberId: string): boolean {
    return (room.connections.get(memberId) ?? 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // Lobby actions (FR-3, FR-4)
  // ---------------------------------------------------------------------------

  setReady(room: Room, memberId: string, ready: boolean): Result {
    const member = this.member(room, memberId);
    if (!member) return fail('MEMBER_NOT_FOUND');
    if (room.status === 'playing') return fail('NOT_IN_LOBBY');
    member.ready = member.isHost || ready;
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  leave(room: Room, memberId: string): Result {
    const member = this.member(room, memberId);
    if (!member) return fail('MEMBER_NOT_FOUND');
    if (member.isHost) return fail('HOST_CANNOT_LEAVE');
    if (room.status === 'playing' && member.role === 'player') return fail('NOT_IN_LOBBY');
    room.members = room.members.filter((m) => m.id !== memberId);
    this.systemMessage(room, systemChat.left(member.name));
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  kick(room: Room, hostId: string, memberId: string): Result {
    if (!this.member(room, hostId)?.isHost) return fail('NOT_HOST');
    if (hostId === memberId) return fail('CANNOT_KICK_SELF');
    const member = this.member(room, memberId);
    if (!member || member.open) return fail('MEMBER_NOT_FOUND');
    if (room.status === 'playing' && member.role === 'player') {
      // The engine keeps its seat; the seat opens for someone else and is auto-played meanwhile.
      member.open = true;
      member.ready = false;
      room.openedAt.set(member.id, this.now());
    } else {
      room.members = room.members.filter((m) => m.id !== memberId);
    }
    room.connections.delete(memberId);
    this.events.memberRemoved(room, memberId, 'kicked');
    this.systemMessage(room, systemChat.removed(member.name));
    this.persist(room);
    this.schedule(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  setLocked(room: Room, locked: boolean): Result {
    room.locked = locked;
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  updateSettings(room: Room, hostId: string, settings: RoomSettings): Result {
    if (!this.member(room, hostId)?.isHost) return fail('NOT_HOST');
    if (room.status === 'playing') return fail('NOT_IN_LOBBY');
    room.settings = settings;
    this.persist(room);
    this.events.roomChanged(room);
    return { ok: true };
  }

  /** Why the game cannot start yet, or null. */
  startBlocker(room: Room): string | null {
    if (room.status === 'playing') return serverErrors.NOT_IN_LOBBY;
    const players = this.players(room);
    if (players.length < 2) return serverErrors.startNeedsPlayers(2);
    if (players.length > room.settings.maxPlayers) {
      return serverErrors.startTooManyPlayers(room.settings.maxPlayers);
    }
    const waiting = players.filter((m) => !m.ready && !m.isHost).map((m) => m.name);
    if (room.status === 'lobby' && waiting.length > 0) return serverErrors.startNotReady(waiting);
    return null;
  }

  start(room: Room, hostId: string): Result {
    if (!this.member(room, hostId)?.isHost) return fail('NOT_HOST');
    const blocker = this.startBlocker(room);
    if (blocker) return { ok: false, code: 'CANNOT_START', message: blocker };

    const joined = [...this.players(room)].sort((a, b) => a.joinedAt - b.joinedAt);
    const seated = room.settings.seatOrder === 'random' ? cryptoShuffle(joined) : joined;
    const record: GameRecord = {
      seats: seated.map((m) => ({ id: m.id, name: m.name })),
      ...(room.settings.firstPlayer === 'firstSeat' ? { startingPlayerIndex: 0 } : {}),
      seed: newSeed(),
      actions: [],
    };
    room.game = record;
    room.state = createGame(
      {
        players: record.seats,
        pack: basePack,
        ...(record.startingPlayerIndex === undefined
          ? {}
          : { startingPlayerIndex: record.startingPlayerIndex }),
      },
      record.seed,
    );
    room.status = 'playing';
    for (const m of room.members) m.ready = m.isHost;
    room.turnOwner = null;
    this.systemMessage(room, systemChat.started);
    this.persist(room);
    this.log.info('game.started', { room: room.id, players: record.seats.length });
    this.schedule(room);
    this.events.roomChanged(room);
    this.events.gameChanged(room);
    return { ok: true };
  }

  /** Same room, same seats, fresh game (FR-12). */
  playAgain(room: Room, hostId: string): Result {
    if (!this.member(room, hostId)?.isHost) return fail('NOT_HOST');
    if (room.status !== 'finished') return fail('NOT_FINISHED');
    for (const m of room.members) m.ready = true;
    room.status = 'lobby';
    return this.start(room, hostId);
  }

  close(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    for (const m of room.members) this.events.memberRemoved(room, m.id, 'closed');
    this.rooms.delete(room.id);
    this.byCode.delete(room.code);
    this.store.deleteRoom(room.id);
    this.log.info('room.closed', { room: room.id });
  }

  // ---------------------------------------------------------------------------
  // Game actions (5.3)
  // ---------------------------------------------------------------------------

  /**
   * Applies a player's intent. `version` must match the current game version,
   * which rejects replays and out-of-order messages.
   */
  act(room: Room, memberId: string, version: number, intent: ActionIntent): Result {
    if (!room.state || room.status !== 'playing') return fail('NO_GAME');
    const member = this.member(room, memberId);
    if (!member || member.role !== 'player' || member.open) return fail('NOT_A_PLAYER');
    if (version !== room.state.version) return fail('STALE_VERSION');
    const result = applyAction(room.state, { ...intent, playerId: memberId } as GameAction);
    if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message };
    this.commit(room, result.state);
    return { ok: true };
  }

  private commit(room: Room, next: GameState): void {
    room.state = next;
    // Record the engine's normalized copy of the action, never the raw client payload.
    const entry = next.log.at(-1)!;
    room.game!.actions.push({ ...entry.action, playerId: entry.playerId } as GameAction);
    if (next.status === 'finished') {
      room.status = 'finished';
      // Seats opened mid-game have nobody behind them; drop them before the next game.
      room.members = room.members.filter((m) => !m.open);
      room.openedAt.clear();
      this.recordHistory(room, next);
      this.systemMessage(room, systemChat.finished);
      this.log.info('game.finished', { room: room.id, reason: next.result?.reason });
    }
    this.persist(room);
    this.schedule(room);
    this.events.gameChanged(room);
    this.events.roomChanged(room);
  }

  /** Plays safe moves until the current player's turn is over (timer or auto-skip). */
  private autoplay(room: Room, reason: 'timer' | 'disconnected' | 'open'): void {
    const state = room.state;
    if (!state || room.status !== 'playing') return;
    const playerId = state.players[state.currentPlayerIndex]!.id;
    const name = state.players[state.currentPlayerIndex]!.name;
    for (let i = 0; i < 6 && room.state!.status === 'playing'; i++) {
      const current = room.state!.players[room.state!.currentPlayerIndex]!.id;
      if (current !== playerId) break;
      const intent = autoIntent(room.state!, playerId);
      if (!intent) break;
      const result = applyAction(room.state!, { ...intent, playerId } as GameAction);
      if (!result.ok) {
        this.log.error('autoplay.rejected', { room: room.id, code: result.error.code });
        break;
      }
      this.commit(room, result.state);
    }
    if (reason !== 'open') {
      this.systemMessage(
        room,
        reason === 'timer' ? systemChat.timedOut(name) : systemChat.skipped(name),
      );
    }
    this.log.info('game.autoplay', { room: room.id, reason });
  }

  /** Arms the soonest of: turn timer, disconnected-player skip, open-seat skip. */
  private schedule(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.deadline = null;
    const state = room.state;
    if (!state || room.status !== 'playing') return;
    // With no player connected the table simply waits (FR-5): nothing plays itself.
    const anyoneHere = state.players.some((p) => this.isConnected(room, p.id));
    if (!anyoneHere) return;

    const current = state.players[state.currentPlayerIndex]!.id;
    if (room.turnOwner !== current) {
      room.turnOwner = current;
      room.turnStartedAt = this.now();
    }
    const member = this.member(room, current);
    const candidates: { at: number; reason: 'timer' | 'disconnected' | 'open' }[] = [];
    if (room.settings.turnTimer > 0) {
      candidates.push({ at: room.turnStartedAt + room.settings.turnTimer * 1000, reason: 'timer' });
    }
    if (member?.open) {
      const since = Math.max(room.turnStartedAt, room.openedAt.get(current) ?? 0);
      candidates.push({ at: since + LIMITS.openSeatSkipMs, reason: 'open' });
    } else if (room.settings.disconnectSkip > 0 && !this.isConnected(room, current)) {
      const since = Math.max(
        room.turnStartedAt,
        room.disconnectedAt.get(current) ?? room.turnStartedAt,
      );
      candidates.push({ at: since + room.settings.disconnectSkip * 1000, reason: 'disconnected' });
    }
    if (candidates.length === 0) return;
    const next = candidates.reduce((a, b) => (b.at < a.at ? b : a));
    room.deadline = next.at;
    room.timer = setTimeout(
      () => this.autoplay(room, next.reason),
      Math.max(0, next.at - this.now()),
    );
    room.timer.unref?.();
  }

  private recordHistory(room: Room, state: GameState): void {
    const result = state.result!;
    const entry: HistoryEntry = {
      id: newId('h'),
      roomName: room.name,
      finishedAt: this.now(),
      rounds: state.round,
      reason: result.reason,
      players: result.standings.map((s) => {
        const p = state.players.find((x) => x.id === s.playerId)!;
        return {
          name: p.name,
          points: s.points,
          cards: s.purchasedCount,
          nobles: p.nobles.length,
          rank: s.rank,
          winner: result.winners.includes(s.playerId),
        };
      }),
    };
    this.store.addHistory(entry);
  }

  // ---------------------------------------------------------------------------
  // Chat (FR-14)
  // ---------------------------------------------------------------------------

  say(room: Room, memberId: string, kind: 'text' | 'emote', text: string): Result {
    const member = this.member(room, memberId);
    if (!member || member.open) return fail('MEMBER_NOT_FOUND');
    this.pushChat(room, {
      id: newId('c'),
      memberId,
      name: member.name,
      color: member.color,
      kind,
      text,
      at: this.now(),
    });
    return { ok: true };
  }

  private systemMessage(room: Room, text: string): void {
    this.pushChat(room, {
      id: newId('c'),
      memberId: 'system',
      name: '',
      color: null,
      kind: 'system',
      text,
      at: this.now(),
    });
  }

  private pushChat(room: Room, message: ChatMessage): void {
    room.chat.push(message);
    if (room.chat.length > LIMITS.chatHistory)
      room.chat.splice(0, room.chat.length - LIMITS.chatHistory);
    room.lastActivity = this.now();
    this.events.chat(room, message);
  }

  // ---------------------------------------------------------------------------
  // Views (FR-20)
  // ---------------------------------------------------------------------------

  roomView(room: Room, memberId: string): RoomView {
    const me = this.member(room, memberId)!;
    const members: MemberView[] = room.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      role: m.role,
      isHost: m.isHost,
      ready: m.ready,
      connected: this.isConnected(room, m.id),
      open: m.open,
    }));
    return {
      code: room.code,
      name: room.name,
      status: room.status,
      locked: room.locked,
      settings: room.settings,
      members,
      me: { memberId: me.id, role: me.role, isHost: me.isHost },
      startBlocker: me.isHost ? this.startBlocker(room) : null,
      turnDeadline: room.deadline,
      serverNow: this.now(),
    };
  }

  /** Players see their own redacted view; spectators see the public one. */
  gameView(room: Room, memberId: string): GameView | null {
    if (!room.state) return null;
    const member = this.member(room, memberId);
    const seated = member?.role === 'player' && room.state.players.some((p) => p.id === memberId);
    return getPublicView(room.state, seated ? memberId : null);
  }

  // ---------------------------------------------------------------------------
  // Housekeeping (SEC-7)
  // ---------------------------------------------------------------------------

  /** Closes rooms nobody has used for a long time. */
  cleanup(): number {
    const now = this.now();
    let closed = 0;
    for (const room of this.all()) {
      if (room.connections.size > 0) continue;
      const idle = now - room.lastActivity;
      const limit = room.status === 'playing' ? LIMITS.idleGameMs : LIMITS.idleLobbyMs;
      if (idle > limit) {
        this.close(room);
        closed += 1;
      }
    }
    return closed;
  }

  shutdown(): void {
    for (const room of this.rooms.values()) if (room.timer) clearTimeout(room.timer);
  }
}
